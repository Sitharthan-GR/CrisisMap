import structlog
from fastapi import APIRouter, Depends, status

from app.dependencies import SettingsDep, SupabaseDep
from app.schemas.common import success
from app.schemas.report import CrisisReportsQuery, ReportCreate, ReportStatusUpdate
from app.services import photos as photo_service
from app.services import reports as report_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreate,
    supabase: SupabaseDep,
    settings: SettingsDep,
) -> dict:
    data = await report_service.create_report(supabase, settings, payload)
    return success(data.model_dump(mode="json"))


@router.get("/{report_id}")
async def get_report(report_id: str, supabase: SupabaseDep) -> dict:
    report = await report_service.get_report(supabase, report_id)
    photos = await photo_service.list_report_photos(supabase, report_id)
    body = report.model_dump(mode="json")
    body["photos"] = [photo.model_dump(mode="json") for photo in photos]
    return success(body)


@router.get("/{report_id}/versions")
async def list_report_versions(report_id: str, supabase: SupabaseDep) -> dict:
    versions = await report_service.list_report_versions(supabase, report_id)
    return success([item.model_dump(mode="json") for item in versions])


@router.patch("/{report_id}/status")
async def update_report_status(
    report_id: str,
    payload: ReportStatusUpdate,
    supabase: SupabaseDep,
) -> dict:
    data = await report_service.update_report_status(supabase, report_id, payload)
    return success(data.model_dump(mode="json"))
