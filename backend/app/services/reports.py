from datetime import datetime
from math import ceil
from typing import Any

import structlog

from app.config import Settings
from app.core.exceptions import NotFoundError, ValidationError
from app.schemas.common import PaginatedResults, PaginationMeta
from app.schemas.location import LocationDetail, LocationSummary
from app.schemas.report import (
    CrisisReportsQuery,
    ReportCreate,
    ReportOut,
    ReportStatusUpdate,
    ReportVersionOut,
)
from app.services.crisis import get_crisis, require_active_crisis
from app.services.geocoding import haversine_meters, reverse_geocode
from app.services.supabase import SupabaseClient

logger = structlog.get_logger(__name__)

LOCATION_SELECT = (
    "id,latitude,longitude,what3words,admin_level_1,admin_level_2,admin_level_3,"
    "latest_damage_level,report_count,last_updated_at"
)
REPORT_SELECT = (
    "id,crisis_id,location_id,damage_level,infra_type,infra_subtype,infra_name,"
    "debris_present,nature_of_crisis,description_raw,description_translated,reporter_name,"
    "source_language,is_latest_version,version_number,submission_channel,status,"
    "collected_at,submitted_at"
)


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _location_summary(row: dict[str, Any]) -> LocationSummary:
    return LocationSummary(
        id=row["id"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        what3words=row.get("what3words"),
        admin_level_1=row.get("admin_level_1"),
        admin_level_2=row.get("admin_level_2"),
        admin_level_3=row.get("admin_level_3"),
    )


def _location_detail(row: dict[str, Any]) -> LocationDetail:
    return LocationDetail(
        id=row["id"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        what3words=row.get("what3words"),
        admin_level_1=row.get("admin_level_1"),
        admin_level_2=row.get("admin_level_2"),
        admin_level_3=row.get("admin_level_3"),
        latest_damage_level=row.get("latest_damage_level"),
        report_count=row.get("report_count", 0),
        last_updated_at=_parse_dt(row["last_updated_at"]) if row.get("last_updated_at") else None,
    )


def _report_out(row: dict[str, Any], location: dict[str, Any] | None = None) -> ReportOut:
    loc_row = location or row.get("location")
    location_model = None
    if isinstance(loc_row, dict):
        if "report_count" in loc_row:
            location_model = _location_detail(loc_row)
        else:
            location_model = _location_summary(loc_row)

    return ReportOut(
        id=row["id"],
        crisis_id=row["crisis_id"],
        location_id=row["location_id"],
        damage_level=row["damage_level"],
        infra_type=row["infra_type"],
        infra_subtype=row.get("infra_subtype"),
        infra_name=row.get("infra_name"),
        debris_present=row["debris_present"],
        nature_of_crisis=row.get("nature_of_crisis"),
        description_raw=row.get("description_raw"),
        description_translated=row.get("description_translated"),
        reporter_name=row.get("reporter_name") or "anonymous",
        source_language=row.get("source_language"),
        is_latest_version=row["is_latest_version"],
        version_number=row["version_number"],
        submission_channel=row["submission_channel"],
        status=row["status"],
        collected_at=_parse_dt(row["collected_at"]),
        submitted_at=_parse_dt(row["submitted_at"]),
        location=location_model,
    )


async def _resolve_coordinates(
    settings: Settings, payload: ReportCreate
) -> tuple[float, float, str | None]:
    location = payload.location
    w3w = location.what3words

    if location.latitude is not None and location.longitude is not None:
        return location.latitude, location.longitude, w3w

    from app.services.geocoding import decode_what3words

    decoded = await decode_what3words(settings, w3w or "")
    return decoded.latitude, decoded.longitude, decoded.words


async def _find_or_create_location(
    supabase: SupabaseClient,
    settings: Settings,
    *,
    latitude: float,
    longitude: float,
    what3words: str | None,
    location_method: str,
    building_footprint_id: str | None,
) -> dict[str, Any]:
    delta = settings.location_match_tolerance_meters / 111_000
    candidates, _ = await supabase.select(
        "location",
        filters=[
            ("latitude", f"gte.{latitude - delta}"),
            ("latitude", f"lte.{latitude + delta}"),
            ("longitude", f"gte.{longitude - delta}"),
            ("longitude", f"lte.{longitude + delta}"),
        ],
        limit=50,
    )

    for candidate in candidates:
        distance = haversine_meters(
            latitude, longitude, candidate["latitude"], candidate["longitude"]
        )
        if distance <= settings.location_match_tolerance_meters:
            return candidate

    geocode = await reverse_geocode(settings, latitude, longitude)
    return await supabase.insert(
        "location",
        {
            "latitude": latitude,
            "longitude": longitude,
            "what3words": what3words,
            "building_footprint_id": building_footprint_id,
            "admin_level_1": geocode.admin_level_1,
            "admin_level_2": geocode.admin_level_2,
            "admin_level_3": geocode.admin_level_3,
            "location_method": location_method,
        },
    )


async def create_report(
    supabase: SupabaseClient, settings: Settings, payload: ReportCreate
) -> ReportOut:
    await require_active_crisis(supabase, payload.crisis_id)
    latitude, longitude, w3w = await _resolve_coordinates(settings, payload)

    location = await _find_or_create_location(
        supabase,
        settings,
        latitude=latitude,
        longitude=longitude,
        what3words=w3w,
        location_method=payload.location.location_method,
        building_footprint_id=payload.location.building_footprint_id,
    )

    report_row = await supabase.insert(
        "report",
        {
            "crisis_id": payload.crisis_id,
            "location_id": location["id"],
            "damage_level": payload.damage_level,
            "infra_type": payload.infra_type,
            "infra_subtype": payload.infra_subtype,
            "infra_name": payload.infra_name,
            "debris_present": payload.debris_present,
            "nature_of_crisis": payload.nature_of_crisis,
            "description_raw": payload.description_raw,
            "reporter_name": payload.reporter_name,
            "source_language": payload.source_language,
            "submission_channel": payload.submission_channel,
            "collected_at": payload.collected_at.isoformat(),
        },
    )

    refreshed_location = await supabase.select_one(
        "location",
        columns=LOCATION_SELECT,
        filters=[("id", f"eq.{location['id']}")],
    )
    logger.info("report_created", report_id=report_row["id"], location_id=location["id"])
    return _report_out(report_row, refreshed_location or location)


async def get_report(supabase: SupabaseClient, report_id: str) -> ReportOut:
    row = await supabase.select_one(
        "report",
        columns=f"{REPORT_SELECT},location({LOCATION_SELECT})",
        filters=[("id", f"eq.{report_id}")],
    )
    if not row:
        raise NotFoundError("Report not found")
    return _report_out(row)


async def update_report_status(
    supabase: SupabaseClient, report_id: str, payload: ReportStatusUpdate
) -> ReportOut:
    await get_report(supabase, report_id)
    row = await supabase.update(
        "report",
        [("id", f"eq.{report_id}")],
        {"status": payload.status},
    )
    return _report_out(row)


async def list_report_versions(
    supabase: SupabaseClient, report_id: str
) -> list[ReportVersionOut]:
    report = await get_report(supabase, report_id)
    rows, _ = await supabase.select(
        "report",
        columns="id,version_number,damage_level,is_latest_version,collected_at,submitted_at",
        filters=[("location_id", f"eq.{report.location_id}")],
        order="version_number.desc",
    )
    return [
        ReportVersionOut(
            id=row["id"],
            version_number=row["version_number"],
            damage_level=row["damage_level"],
            is_latest_version=row["is_latest_version"],
            collected_at=_parse_dt(row["collected_at"]),
            submitted_at=_parse_dt(row["submitted_at"]),
        )
        for row in rows
    ]


def _build_report_filters(crisis_id: str, query: CrisisReportsQuery) -> list[tuple[str, str]]:
    filters: list[tuple[str, str]] = [
        ("crisis_id", f"eq.{crisis_id}"),
        ("is_latest_version", "eq.true"),
    ]
    if query.damage_level:
        filters.append(("damage_level", f"eq.{query.damage_level}"))
    if query.infra_type:
        filters.append(("infra_type", f"eq.{query.infra_type}"))
    if query.status:
        filters.append(("status", f"eq.{query.status}"))
    if query.date_from:
        filters.append(("collected_at", f"gte.{query.date_from.isoformat()}"))
    if query.date_to:
        filters.append(("collected_at", f"lte.{query.date_to.isoformat()}"))
    return filters


async def list_crisis_reports(
    supabase: SupabaseClient,
    crisis_id: str,
    query: CrisisReportsQuery,
) -> PaginatedResults[ReportOut]:
    await get_crisis(supabase, crisis_id)
    offset = (query.page - 1) * query.limit
    filters = _build_report_filters(crisis_id, query)

    if query.admin_level_2:
        rows, total = await supabase.select(
            "report",
            columns=f"{REPORT_SELECT},location!inner({LOCATION_SELECT})",
            filters=[
                *filters,
                ("location.admin_level_2", f"eq.{query.admin_level_2}"),
            ],
            limit=query.limit,
            offset=offset,
            order="collected_at.desc",
            count=True,
        )
    else:
        rows, total = await supabase.select(
            "report",
            columns=f"{REPORT_SELECT},location({LOCATION_SELECT})",
            filters=filters,
            limit=query.limit,
            offset=offset,
            order="collected_at.desc",
            count=True,
        )

    total_count = total if total is not None else len(rows)
    pages = max(1, ceil(total_count / query.limit)) if total_count else 1
    return PaginatedResults(
        results=[_report_out(row) for row in rows],
        pagination=PaginationMeta(
            page=query.page,
            limit=query.limit,
            total=total_count,
            pages=pages,
        ),
    )


async def list_reports_for_export(
    supabase: SupabaseClient,
    crisis_id: str | None,
    *,
    status: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    include_all_statuses: bool,
) -> list[dict[str, Any]]:
    from app.services.crisis import list_all_crises

    if crisis_id:
        crisis_ids = [crisis_id]
    else:
        crises = await list_all_crises(supabase)
        crisis_ids = [crisis.id for crisis in crises if not crisis.is_unlisted]
        if not crisis_ids:
            return []

    filters: list[tuple[str, str]] = [
        ("is_latest_version", "eq.true"),
    ]
    if len(crisis_ids) == 1:
        filters.append(("crisis_id", f"eq.{crisis_ids[0]}"))
    else:
        filters.append(("crisis_id", f"in.({','.join(crisis_ids)})"))

    if not include_all_statuses:
        filters.append(("status", f"eq.{status or 'validated'}"))
    if date_from:
        filters.append(("collected_at", f"gte.{date_from.isoformat()}"))
    if date_to:
        filters.append(("collected_at", f"lte.{date_to.isoformat()}"))

    rows, _ = await supabase.select(
        "report",
        columns=f"{REPORT_SELECT},location({LOCATION_SELECT})",
        filters=filters,
        order="collected_at.asc",
        limit=10_000,
    )
    return rows


async def _assert_unlisted_report(supabase: SupabaseClient, report_id: str) -> ReportOut:
    from app.services.crisis import get_or_create_unlisted_crisis

    report = await get_report(supabase, report_id)
    unlisted = await get_or_create_unlisted_crisis(supabase)
    if report.crisis_id != unlisted.id:
        raise ValidationError("Report is not an unlisted report")
    return report


async def _move_report_photos_to_crisis(
    supabase: SupabaseClient,
    report_id: str,
    old_crisis_id: str,
    new_crisis_id: str,
) -> None:
    from app.services.photos import MIME_EXTENSIONS

    rows, _ = await supabase.select(
        "photo",
        filters=[("report_id", f"eq.{report_id}")],
    )
    for row in rows:
        old_path = row["storage_url"]
        mime_type = row.get("mime_type") or "image/jpeg"
        ext = MIME_EXTENSIONS.get(mime_type, "jpg")
        photo_id = row["id"]
        new_path = f"{new_crisis_id}/{report_id}/original_{photo_id}.{ext}"
        if old_path != new_path:
            await supabase.move_storage_object(old_path, new_path)
            await supabase.update(
                "photo",
                [("id", f"eq.{photo_id}")],
                {"storage_url": new_path},
            )


async def list_unlisted_reports(supabase: SupabaseClient) -> list[dict[str, Any]]:
    from app.schemas.admin import UnlistedReportOut
    from app.services.crisis import get_or_create_unlisted_crisis
    from app.services.photos import list_report_photos

    unlisted = await get_or_create_unlisted_crisis(supabase)
    rows, _ = await supabase.select(
        "report",
        columns=f"{REPORT_SELECT},location({LOCATION_SELECT})",
        filters=[
            ("crisis_id", f"eq.{unlisted.id}"),
            ("is_latest_version", "eq.true"),
        ],
        order="collected_at.desc",
        limit=500,
    )
    results: list[dict[str, Any]] = []
    for row in rows:
        report = _report_out(row)
        photos = await list_report_photos(supabase, row["id"])
        item = UnlistedReportOut(**report.model_dump(), photos=photos)
        results.append(item.model_dump(mode="json"))
    return results


async def assign_unlisted_report(
    supabase: SupabaseClient, report_id: str, target_crisis_id: str
) -> ReportOut:
    from app.services.crisis import get_crisis

    report = await _assert_unlisted_report(supabase, report_id)
    target = await get_crisis(supabase, target_crisis_id)
    if target.is_unlisted:
        raise ValidationError("Cannot assign to the unlisted crisis")
    if target.status != "active":
        raise ValidationError("Target crisis must be active")

    await _move_report_photos_to_crisis(
        supabase, report_id, report.crisis_id, target_crisis_id
    )
    await supabase.update(
        "report",
        [("id", f"eq.{report_id}")],
        {"crisis_id": target_crisis_id},
    )
    logger.info(
        "unlisted_report_assigned",
        report_id=report_id,
        crisis_id=target_crisis_id,
    )
    return await get_report(supabase, report_id)


async def create_crisis_from_unlisted_report(
    supabase: SupabaseClient,
    report_id: str,
    *,
    name: str,
    crisis_type: str,
    crisis_subtype: str,
    onset_at: datetime,
    epicenter_lat: float | None = None,
    epicenter_lng: float | None = None,
) -> tuple[Any, ReportOut]:
    from app.services.crisis import create_crisis
    from app.schemas.crisis import CrisisCreate

    report = await _assert_unlisted_report(supabase, report_id)
    lat = epicenter_lat
    lng = epicenter_lng
    if lat is None and report.location is not None:
        lat = report.location.latitude
    if lng is None and report.location is not None:
        lng = report.location.longitude

    crisis = await create_crisis(
        supabase,
        CrisisCreate(
            name=name,
            crisis_type=crisis_type,  # type: ignore[arg-type]
            crisis_subtype=crisis_subtype,
            onset_at=onset_at,
            epicenter_lat=lat,
            epicenter_lng=lng,
        ),
    )
    updated = await assign_unlisted_report(supabase, report_id, crisis.id)
    return crisis, updated


async def delete_unlisted_report(supabase: SupabaseClient, report_id: str) -> None:
    await _assert_unlisted_report(supabase, report_id)
    photos, _ = await supabase.select(
        "photo",
        filters=[("report_id", f"eq.{report_id}")],
    )
    for photo in photos:
        try:
            await supabase.delete_storage_object(photo["storage_url"])
        except Exception:
            logger.warning(
                "photo_storage_delete_failed",
                photo_id=photo["id"],
                path=photo["storage_url"],
            )
        await supabase.delete("photo", [("id", f"eq.{photo['id']}")])
    await supabase.delete("report", [("id", f"eq.{report_id}")])
    logger.info("unlisted_report_deleted", report_id=report_id)
