from datetime import datetime
from typing import Any

import structlog

from app.config import Settings
from app.core.exceptions import CrisisClosedError, NotFoundError, ValidationError
from app.schemas.crisis import CrisisCreate, CrisisListQuery, CrisisOut, CrisisStatus, CrisisUpdate
from app.services.supabase import SupabaseClient

logger = structlog.get_logger(__name__)


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _row_to_crisis(row: dict[str, Any]) -> CrisisOut:
    return CrisisOut(
        id=row["id"],
        name=row["name"],
        crisis_type=row["crisis_type"],
        crisis_subtype=row["crisis_subtype"],
        epicenter_lat=row.get("epicenter_lat"),
        epicenter_lng=row.get("epicenter_lng"),
        status=row["status"],
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
        },
    )
    logger.info("crisis_created", crisis_id=row["id"])
    return _row_to_crisis(row)


async def list_crises(supabase: SupabaseClient, query: CrisisListQuery) -> list[CrisisOut]:
    rows, _ = await supabase.select(
        "crisis",
        filters=[("status", f"eq.{query.status}")],
        order="onset_at.desc",
    )
    return [_row_to_crisis(row) for row in rows]


async def get_crisis(supabase: SupabaseClient, crisis_id: str) -> CrisisOut:
    row = await supabase.select_one("crisis", filters=[("id", f"eq.{crisis_id}")])
    if not row:
        raise NotFoundError("Crisis not found")
    return _row_to_crisis(row)


async def update_crisis(
    supabase: SupabaseClient, crisis_id: str, payload: CrisisUpdate
) -> CrisisOut:
    await get_crisis(supabase, crisis_id)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise ValidationError("At least one field is required")
    row = await supabase.update("crisis", [("id", f"eq.{crisis_id}")], updates)
    return _row_to_crisis(row)


async def require_active_crisis(supabase: SupabaseClient, crisis_id: str) -> CrisisOut:
    crisis = await get_crisis(supabase, crisis_id)
    if crisis.status != "active":
        raise CrisisClosedError()
    return crisis


def assert_crisis_status(value: str) -> CrisisStatus:
    if value not in ("active", "closed"):
        raise ValidationError("status must be active or closed")
    return value  # type: ignore[return-value]
