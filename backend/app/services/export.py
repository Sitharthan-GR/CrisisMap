import csv
import io
import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from typing import Any

import shapefile

from app.services.crisis import list_all_crises
from app.services.reports import list_reports_for_export
from app.services.supabase import SupabaseClient

CSV_COLUMNS = [
    "crisis_id",
    "crisis_name",
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

WGS84_PRJ = (
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
    'PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]'
)

# Shapefile field names are limited to 10 characters.
SHAPEFILE_FIELDS: list[tuple[str, str, int, int]] = [
    ("crisis_id", "C", 36, 0),
    ("crisis_nm", "C", 200, 0),
    ("report_id", "C", 36, 0),
    ("version", "N", 10, 0),
    ("collected", "C", 32, 0),
    ("submitted", "C", 32, 0),
    ("damage", "C", 20, 0),
    ("infra_type", "C", 20, 0),
    ("infra_sub", "C", 100, 0),
    ("infra_name", "C", 200, 0),
    ("debris", "L", 1, 0),
    ("nature", "C", 50, 0),
    ("desc_raw", "C", 254, 0),
    ("desc_tr", "C", 254, 0),
    ("reporter", "C", 100, 0),
    ("src_lang", "C", 10, 0),
    ("channel", "C", 20, 0),
    ("status", "C", 20, 0),
    ("photo_cnt", "N", 10, 0),
    ("what3words", "C", 100, 0),
    ("admin1", "C", 100, 0),
    ("admin2", "C", 100, 0),
    ("admin3", "C", 100, 0),
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


def _export_filename(crisis_key: str, extension: str) -> str:
    date = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"rapida_{crisis_key}_{date}.{extension}"


def _crisis_key(crisis_id: str | None) -> str:
    return "all_crises" if crisis_id is None else crisis_id


async def _crisis_name_map(supabase: SupabaseClient) -> dict[str, str]:
    crises = await list_all_crises(supabase)
    return {crisis.id: crisis.name for crisis in crises}


def _flatten_export_row(
    row: dict[str, Any],
    photo_count: int,
    crisis_names: dict[str, str],
) -> dict[str, Any]:
    location = row.get("location") or {}
    row_crisis_id = row.get("crisis_id", "")
    return {
        "crisis_id": row_crisis_id,
        "crisis_name": crisis_names.get(row_crisis_id, ""),
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
        "photo_count": photo_count,
    }


async def _load_export_rows(
    supabase: SupabaseClient,
    crisis_id: str | None,
    *,
    status: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    include_all_statuses: bool,
) -> list[dict[str, Any]]:
    rows = await list_reports_for_export(
        supabase,
        crisis_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        include_all_statuses=include_all_statuses,
    )
    photo_counts = await _photo_counts(supabase, [row["id"] for row in rows])
    crisis_names = await _crisis_name_map(supabase)
    return [
        _flatten_export_row(row, photo_counts.get(row["id"], 0), crisis_names)
        for row in rows
    ]


async def export_csv(
    supabase: SupabaseClient,
    crisis_id: str | None,
    *,
    status: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    include_all_statuses: bool,
) -> tuple[str, str]:
    flat_rows = await _load_export_rows(
        supabase,
        crisis_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        include_all_statuses=include_all_statuses,
    )

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for row in flat_rows:
        writer.writerow({column: row.get(column) for column in CSV_COLUMNS})

    return buffer.getvalue(), _export_filename(_crisis_key(crisis_id), "csv")


async def export_geojson(
    supabase: SupabaseClient,
    crisis_id: str | None,
    *,
    status: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    include_all_statuses: bool,
) -> tuple[str, str]:
    flat_rows = await _load_export_rows(
        supabase,
        crisis_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        include_all_statuses=include_all_statuses,
    )

    features: list[dict[str, Any]] = []
    for row in flat_rows:
        lat = row.get("latitude")
        lng = row.get("longitude")
        if lat is None or lng is None:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": row,
            }
        )

    payload = {"type": "FeatureCollection", "features": features}
    return json.dumps(payload, default=str), _export_filename(_crisis_key(crisis_id), "geojson")


def _shapefile_record(row: dict[str, Any]) -> list[Any]:
    return [
        row.get("crisis_id") or "",
        row.get("crisis_name") or "",
        row["report_id"],
        row["version_number"],
        str(row.get("collected_at") or ""),
        str(row.get("submitted_at") or ""),
        row["damage_level"],
        row["infra_type"],
        row.get("infra_subtype") or "",
        row.get("infra_name") or "",
        "Y" if row.get("debris_present") else "N",
        row.get("nature_of_crisis") or "",
        row.get("description_raw") or "",
        row.get("description_translated") or "",
        row.get("reporter_name") or "anonymous",
        row.get("source_language") or "",
        row["submission_channel"],
        row["status"],
        row.get("photo_count") or 0,
        row.get("what3words") or "",
        row.get("admin_level_1") or "",
        row.get("admin_level_2") or "",
        row.get("admin_level_3") or "",
    ]


async def export_shapefile(
    supabase: SupabaseClient,
    crisis_id: str | None,
    *,
    status: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    include_all_statuses: bool,
) -> tuple[bytes, str]:
    flat_rows = await _load_export_rows(
        supabase,
        crisis_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        include_all_statuses=include_all_statuses,
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        base_path = os.path.join(tmpdir, "reports")
        writer = shapefile.Writer(base_path)
        writer.autoBalance = 1

        for name, field_type, size, decimal in SHAPEFILE_FIELDS:
            if field_type == "L":
                writer.field(name, field_type)
            else:
                writer.field(name, field_type, size, decimal)

        for row in flat_rows:
            lat = row.get("latitude")
            lng = row.get("longitude")
            if lat is None or lng is None:
                continue
            writer.point(float(lng), float(lat))
            writer.record(*_shapefile_record(row))

        writer.close()

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for extension in ("shp", "shx", "dbf"):
                file_path = f"{base_path}.{extension}"
                archive.write(file_path, f"reports.{extension}")
            archive.writestr("reports.prj", WGS84_PRJ)

        return zip_buffer.getvalue(), _export_filename(_crisis_key(crisis_id), "zip")
