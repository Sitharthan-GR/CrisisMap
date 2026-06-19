import re
import uuid
from datetime import datetime
from typing import Any

import structlog

from app.config import Settings
from app.core.exceptions import NotFoundError, StorageError, SupabaseError, ValidationError
from app.schemas.photo import (
    PhotoConfirmRequest,
    PhotoDeleteResponse,
    PhotoInitiateRequest,
    PhotoInitiateResponse,
    PhotoOut,
)
from app.services.reports import get_report
from app.services.supabase import SupabaseClient

logger = structlog.get_logger(__name__)

MIME_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def _parse_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).replace("Z", "+00:00")
    match = re.match(r"^(.+?)\.(\d+)(.*)$", text)
    if match:
        head, frac, rest = match.groups()
        text = f"{head}.{(frac + '000000')[:6]}{rest}"
    return datetime.fromisoformat(text)


def _extension_for_mime(mime_type: str) -> str:
    ext = MIME_EXTENSIONS.get(mime_type)
    if not ext:
        raise ValidationError("mime_type must be image/jpeg, image/png, or image/webp")
    return ext


def _storage_path(crisis_id: str, report_id: str, photo_id: str, mime_type: str) -> str:
    ext = _extension_for_mime(mime_type)
    return f"{crisis_id}/{report_id}/original_{photo_id}.{ext}"


async def _photo_out(
    supabase: SupabaseClient, row: dict[str, Any], *, with_urls: bool = True
) -> PhotoOut:
    storage_path = row["storage_url"]
    signed_url = None
    thumbnail_url = None
    if with_urls:
        signed_url = await supabase.create_signed_url(storage_path)
        try:
            thumbnail_url = await supabase.create_signed_url(
                storage_path,
                transform={"width": 300, "height": 300},
            )
        except SupabaseError:
            thumbnail_url = signed_url

    return PhotoOut(
        id=row["id"],
        report_id=row["report_id"],
        storage_path=storage_path,
        signed_url=signed_url,
        thumbnail_url=thumbnail_url,
        ai_damage_label=row.get("ai_damage_label"),
        ai_confidence=row.get("ai_confidence"),
        ai_debris_tags=row.get("ai_debris_tags") or [],
        file_size_kb=row.get("file_size_kb"),
        mime_type=row.get("mime_type"),
        captured_at=_parse_dt(row.get("captured_at")),
        uploaded_at=_parse_dt(row["uploaded_at"]) or datetime.now(),
    )


async def initiate_photo_upload(
    supabase: SupabaseClient,
    settings: Settings,
    report_id: str,
    payload: PhotoInitiateRequest,
) -> PhotoInitiateResponse:
    report = await get_report(supabase, report_id)
    photo_id = str(uuid.uuid4())
    path = _storage_path(report.crisis_id, report_id, photo_id, payload.mime_type)
    upload = await supabase.create_signed_upload_url(path)
    upload_url = upload.get("signedUrl") or upload.get("signedURL") or upload.get("url")
    if not upload_url:
        raise StorageError("Upload URL missing from Supabase response.")
    if not upload_url.startswith("http"):
        upload_url = f"{settings.supabase_url}/storage/v1{upload_url}"

    return PhotoInitiateResponse(
        photo_id=photo_id,
        storage_path=path,
        upload_url=upload_url,
        expires_in=settings.supabase_upload_url_expiry,
    )


async def confirm_photo_upload(
    supabase: SupabaseClient,
    report_id: str,
    payload: PhotoConfirmRequest,
) -> PhotoOut:
    report = await get_report(supabase, report_id)
    expected_prefix = f"{report.crisis_id}/{report_id}/"
    if not payload.storage_path.startswith(expected_prefix):
        raise ValidationError("storage_path does not match this report")
    if payload.photo_id not in payload.storage_path:
        raise ValidationError("photo_id must match the ID from initiate")

    if not await supabase.storage_object_exists(payload.storage_path):
        raise StorageError("Uploaded file not found in storage.")

    row = await supabase.insert(
        "photo",
        {
            "id": payload.photo_id,
            "report_id": report_id,
            "storage_url": payload.storage_path,
            "file_size_kb": payload.file_size_kb,
            "mime_type": payload.mime_type,
            "captured_at": payload.captured_at.isoformat() if payload.captured_at else None,
            "gps_lat": payload.gps_lat,
            "gps_lng": payload.gps_lng,
        },
    )
    logger.info(
        "photo_confirmed",
        photo_id=payload.photo_id,
        report_id=report_id,
        note="AI classification job enqueue skipped in prototype",
    )
    return await _photo_out(supabase, row)


async def list_report_photos(supabase: SupabaseClient, report_id: str) -> list[PhotoOut]:
    await get_report(supabase, report_id)
    rows, _ = await supabase.select(
        "photo",
        filters=[("report_id", f"eq.{report_id}")],
        order="uploaded_at.asc",
    )
    return [await _photo_out(supabase, row) for row in rows]


async def get_photo(supabase: SupabaseClient, photo_id: str) -> dict[str, Any]:
    row = await supabase.select_one("photo", filters=[("id", f"eq.{photo_id}")])
    if not row:
        raise NotFoundError("Photo not found")
    return row


async def delete_photo(supabase: SupabaseClient, photo_id: str) -> PhotoDeleteResponse:
    row = await get_photo(supabase, photo_id)
    storage_path = row["storage_url"]
    await supabase.delete_storage_object(storage_path)
    await supabase.delete("photo", [("id", f"eq.{photo_id}")])
    logger.info("photo_deleted", photo_id=photo_id)
    return PhotoDeleteResponse()


async def latest_photo_thumbnail_for_location(
    supabase: SupabaseClient, location_id: str
) -> str | None:
    reports, _ = await supabase.select(
        "report",
        columns="id",
        filters=[
            ("location_id", f"eq.{location_id}"),
            ("is_latest_version", "eq.true"),
        ],
        limit=1,
    )
    if not reports:
        return None
    photos, _ = await supabase.select(
        "photo",
        columns="storage_url",
        filters=[("report_id", f"eq.{reports[0]['id']}")],
        order="uploaded_at.desc",
        limit=1,
    )
    if not photos:
        return None
    return await supabase.create_signed_url(
        photos[0]["storage_url"],
        transform={"width": 300, "height": 300},
    )
