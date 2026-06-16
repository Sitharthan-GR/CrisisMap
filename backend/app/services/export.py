import csv
import io
import json
from datetime import datetime, timezone
from typing import Any

from app.services.reports import list_reports_for_export
from app.services.supabase import SupabaseClient

CSV_COLUMNS = [
    "report_id",
    "version_number",
    "collected_at",
    "submitted_at",
    "latitude",
    "longitude",
    "what3words",
    "admin_level_1",
    "admin_level_2",
    "admin_level_3",
    "damage_level",
    "infra_type",
    "infra_subtype",
    "infra_name",
    "debris_present",
    "nature_of_crisis",
    "description_raw",
    "description_translated",
    "reporter_name",
    "source_language",
    "submission_channel",
    "status",
    "photo_count",
]


async def _photo_counts(supabase: SupabaseClient, report_ids: list[str]) -> dict[str, int]:
    if not report_ids:
        return {}
    counts: dict[str, int] = {}
    for report_id in report_ids:
        photos, _ = await supabase.select(
            "photo",
            columns="id",
            filters=[("report_id", f"eq.{report_id}")],
            limit=1000,
        )
        counts[report_id] = len(photos)
    return counts


def _export_filename(crisis_id: str, extension: str) -> str:
    date = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"rapida_{crisis_id}_{date}.{extension}"


async def export_csv(
    supabase: SupabaseClient,
    crisis_id: str,
    *,
    status: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    include_all_statuses: bool,
) -> tuple[str, str]:
    rows = await list_reports_for_export(
        supabase,
        crisis_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        include_all_statuses=include_all_statuses,
    )
    photo_counts = await _photo_counts(supabase, [row["id"] for row in rows])

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for row in rows:
        location = row.get("location") or {}
        writer.writerow(
            {
                "report_id": row["id"],
                "version_number": row["version_number"],
                "collected_at": row["collected_at"],
                "submitted_at": row["submitted_at"],
                "latitude": location.get("latitude"),
                "longitude": location.get("longitude"),
                "what3words": location.get("what3words"),
                "admin_level_1": location.get("admin_level_1"),
                "admin_level_2": location.get("admin_level_2"),
                "admin_level_3": location.get("admin_level_3"),
                "damage_level": row["damage_level"],
                "infra_type": row["infra_type"],
                "infra_subtype": row.get("infra_subtype"),
                "infra_name": row.get("infra_name"),
                "debris_present": row["debris_present"],
                "nature_of_crisis": row.get("nature_of_crisis"),
                "description_raw": row.get("description_raw"),
                "description_translated": row.get("description_translated"),
                "reporter_name": row.get("reporter_name") or "anonymous",
                "source_language": row.get("source_language"),
                "submission_channel": row["submission_channel"],
                "status": row["status"],
                "photo_count": photo_counts.get(row["id"], 0),
            }
        )

    return buffer.getvalue(), _export_filename(crisis_id, "csv")


async def export_geojson(
    supabase: SupabaseClient,
    crisis_id: str,
    *,
    status: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    include_all_statuses: bool,
) -> tuple[str, str]:
    rows = await list_reports_for_export(
        supabase,
        crisis_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        include_all_statuses=include_all_statuses,
    )
    photo_counts = await _photo_counts(supabase, [row["id"] for row in rows])

    features: list[dict[str, Any]] = []
    for row in rows:
        location = row.get("location") or {}
        lat = location.get("latitude")
        lng = location.get("longitude")
        if lat is None or lng is None:
            continue
        properties = {
            **{key: row.get(key) for key in row if key != "location"},
            **{f"location_{key}": value for key, value in location.items()},
            "photo_count": photo_counts.get(row["id"], 0),
        }
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": properties,
            }
        )

    payload = {"type": "FeatureCollection", "features": features}
    return json.dumps(payload, default=str), _export_filename(crisis_id, "geojson")
