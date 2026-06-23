from datetime import datetime, timezone
from typing import Any

import re
import structlog

from app.core.exceptions import CrisisClosedError, NotFoundError, ValidationError
from app.schemas.admin import AdminDashboardOut, CrisisReportStatsOut
from app.schemas.crisis import CrisisCreate, CrisisListQuery, CrisisOut, CrisisStatus, CrisisUpdate, ReportingOptionsOut
from app.services.geocoding import haversine_meters
from app.services.supabase import SupabaseClient

logger = structlog.get_logger(__name__)


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value).replace("Z", "+00:00")
    match = re.match(r"^(.+?)\.(\d+)(.*)$", text)
    if match:
        head, frac, rest = match.groups()
        text = f"{head}.{(frac + '000000')[:6]}{rest}"
    return datetime.fromisoformat(text)


def _row_to_crisis(row: dict[str, Any]) -> CrisisOut:
    return CrisisOut(
        id=row["id"],
        name=row["name"],
        crisis_type=row["crisis_type"],
        crisis_subtype=row["crisis_subtype"],
        epicenter_lat=row.get("epicenter_lat"),
        epicenter_lng=row.get("epicenter_lng"),
        status=row["status"],
        is_unlisted=bool(row.get("is_unlisted", False)),
        form_template_id=row.get("form_template_id"),
        onset_at=_parse_dt(row["onset_at"]),
        created_at=_parse_dt(row["created_at"]),
    )


async def create_crisis(supabase: SupabaseClient, payload: CrisisCreate) -> CrisisOut:
    row = await supabase.insert(
        "crisis",
        {
            "name": payload.name,
            "crisis_type": payload.crisis_type,
            "crisis_subtype": payload.crisis_subtype,
            "epicenter_lat": payload.epicenter_lat,
            "epicenter_lng": payload.epicenter_lng,
            "onset_at": payload.onset_at.isoformat(),
            "form_template_id": payload.form_template_id,
            "is_unlisted": False,
        },
    )
    logger.info("crisis_created", crisis_id=row["id"])
    return _row_to_crisis(row)


async def list_crises(supabase: SupabaseClient, query: CrisisListQuery) -> list[CrisisOut]:
    rows, _ = await supabase.select(
        "crisis",
        filters=[
            ("status", f"eq.{query.status}"),
            ("is_unlisted", "eq.false"),
        ],
        order="onset_at.desc",
    )
    return [_row_to_crisis(row) for row in rows]


async def list_reportable_crises(supabase: SupabaseClient) -> list[CrisisOut]:
    return await list_crises(supabase, CrisisListQuery(status="active"))


def nearest_crisis_id(crises: list[CrisisOut], lat: float, lng: float) -> str | None:
    if not crises:
        return None

    best_id: str | None = None
    best_distance = float("inf")
    for crisis in crises:
        if crisis.epicenter_lat is None or crisis.epicenter_lng is None:
            continue
        if crisis.epicenter_lat == 0 and crisis.epicenter_lng == 0:
            continue
        distance = haversine_meters(lat, lng, crisis.epicenter_lat, crisis.epicenter_lng)
        if distance < best_distance:
            best_distance = distance
            best_id = crisis.id

    return best_id or crises[0].id


async def get_or_create_unlisted_crisis(supabase: SupabaseClient) -> CrisisOut:
    row = await supabase.select_one("crisis", filters=[("is_unlisted", "eq.true")])
    if row:
        return _row_to_crisis(row)

    row = await supabase.insert(
        "crisis",
        {
            "name": "Unlisted",
            "crisis_type": "human_made",
            "crisis_subtype": "unlisted",
            "status": "active",
            "is_unlisted": True,
            "onset_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    logger.info("unlisted_crisis_created", crisis_id=row["id"])
    return _row_to_crisis(row)


async def get_reporting_options(
    supabase: SupabaseClient,
    *,
    lat: float | None = None,
    lng: float | None = None,
) -> ReportingOptionsOut:
    data = await supabase.rpc("get_reporting_options_data", {})
    if not isinstance(data, dict):
        data = {}

    crisis_rows = data.get("crises") or []
    crises = [_row_to_crisis(row) for row in crisis_rows]

    unlisted_id = data.get("unlisted_crisis_id")
    if not unlisted_id:
        unlisted = await get_or_create_unlisted_crisis(supabase)
        unlisted_id = unlisted.id

    nearest: str | None = None
    if lat is not None and lng is not None:
        nearest = nearest_crisis_id(crises, lat, lng)

    return ReportingOptionsOut(
        crises=crises,
        unlisted_crisis_id=unlisted_id,
        nearest_crisis_id=nearest,
    )


async def list_all_crises(supabase: SupabaseClient) -> list[CrisisOut]:
    rows, _ = await supabase.select(
        "crisis",
        order="onset_at.desc",
        limit=500,
    )
    return [_row_to_crisis(row) for row in rows]


async def get_admin_dashboard(supabase: SupabaseClient) -> AdminDashboardOut:
    data = await supabase.rpc("get_admin_dashboard_data", {})
    if not data:
        return AdminDashboardOut(crises=[], stats={}, unlisted_count=0)

    crises = [_row_to_crisis(row) for row in (data.get("crises") or [])]
    stats = {
        crisis_id: CrisisReportStatsOut(**values)
        for crisis_id, values in (data.get("stats") or {}).items()
    }
    return AdminDashboardOut(
        crises=crises,
        stats=stats,
        unlisted_count=int(data.get("unlisted_count") or 0),
    )


async def get_crisis(supabase: SupabaseClient, crisis_id: str) -> CrisisOut:
    row = await supabase.select_one("crisis", filters=[("id", f"eq.{crisis_id}")])
    if not row:
        raise NotFoundError("Crisis not found")
    return _row_to_crisis(row)


async def update_crisis(
    supabase: SupabaseClient, crisis_id: str, payload: CrisisUpdate
) -> CrisisOut:
    await get_crisis(supabase, crisis_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise ValidationError("At least one field is required")
    row = await supabase.update("crisis", [("id", f"eq.{crisis_id}")], updates)
    return _row_to_crisis(row)


async def require_active_crisis(supabase: SupabaseClient, crisis_id: str) -> CrisisOut:
    crisis = await get_crisis(supabase, crisis_id)
    if crisis.status != "active":
        raise CrisisClosedError()
    return crisis


async def assert_public_crisis(supabase: SupabaseClient, crisis_id: str) -> CrisisOut:
    crisis = await get_crisis(supabase, crisis_id)
    if crisis.is_unlisted:
        raise NotFoundError("Crisis not found")
    return crisis


def assert_crisis_status(value: str) -> CrisisStatus:
    if value not in ("active", "closed"):
        raise ValidationError("status must be active or closed")
    return value  # type: ignore[return-value]
