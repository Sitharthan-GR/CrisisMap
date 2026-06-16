import structlog
from fastapi import APIRouter, Depends, status

from app.dependencies import SettingsDep, SupabaseDep
from app.schemas.common import success
from app.schemas.photo import PhotoConfirmRequest, PhotoInitiateRequest
from app.services import photos as photo_service

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["photos"])


@router.post("/reports/{report_id}/photos/initiate")
async def initiate_photo_upload(
    report_id: str,
    payload: PhotoInitiateRequest,
    supabase: SupabaseDep,
    settings: SettingsDep,
) -> dict:
    data = await photo_service.initiate_photo_upload(
        supabase, settings, report_id, payload
    )
    return success(data.model_dump(mode="json"))


@router.post("/reports/{report_id}/photos/confirm", status_code=status.HTTP_201_CREATED)
async def confirm_photo_upload(
    report_id: str,
    payload: PhotoConfirmRequest,
    supabase: SupabaseDep,
) -> dict:
    data = await photo_service.confirm_photo_upload(supabase, report_id, payload)
    return success(data.model_dump(mode="json"))


@router.get("/reports/{report_id}/photos")
async def list_report_photos(report_id: str, supabase: SupabaseDep) -> dict:
    photos = await photo_service.list_report_photos(supabase, report_id)
    return success([photo.model_dump(mode="json") for photo in photos])


@router.delete("/photos/{photo_id}")
async def delete_photo(photo_id: str, supabase: SupabaseDep) -> dict:
    data = await photo_service.delete_photo(supabase, photo_id)
    return success(data.model_dump(mode="json"))
