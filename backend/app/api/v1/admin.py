import secrets

import structlog
from fastapi import APIRouter, status

from app.core.admin_auth import create_admin_token
from app.core.exceptions import UnauthorizedError
from app.dependencies import AdminDep, SettingsDep, SupabaseDep
from app.schemas.admin import (
    AdminAssignReportRequest,
    AdminAssignReportResponse,
    AdminCreateCrisisFromReportRequest,
    AdminLoginRequest,
    AdminLoginResponse,
)
from app.schemas.common import success
from app.schemas.crisis import CrisisCreate, CrisisUpdate
from app.services import crisis as crisis_service
from app.services import reports as report_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login")
async def admin_login(payload: AdminLoginRequest, settings: SettingsDep) -> dict:
    if settings.admin_password is None:
        raise UnauthorizedError("Admin access is not configured")

    expected = settings.admin_password.get_secret_value()
    if not secrets.compare_digest(payload.password, expected):
        raise UnauthorizedError("Invalid admin password")

    ttl_seconds = settings.admin_token_ttl_hours * 3600
    token = create_admin_token(expected, ttl_seconds=ttl_seconds)
    logger.info("admin_login_success")
    return success(
        AdminLoginResponse(token=token, expires_in=ttl_seconds).model_dump(mode="json")
    )


@router.get("/crises")
async def admin_list_crises(_admin: AdminDep, supabase: SupabaseDep) -> dict:
    crises = await crisis_service.list_all_crises(supabase)
    return success([item.model_dump(mode="json") for item in crises])


@router.post("/crises", status_code=status.HTTP_201_CREATED)
async def admin_create_crisis(
    payload: CrisisCreate,
    _admin: AdminDep,
    supabase: SupabaseDep,
) -> dict:
    data = await crisis_service.create_crisis(supabase, payload)
    return success(data.model_dump(mode="json"))


@router.patch("/crises/{crisis_id}")
async def admin_update_crisis(
    crisis_id: str,
    payload: CrisisUpdate,
    _admin: AdminDep,
    supabase: SupabaseDep,
) -> dict:
    data = await crisis_service.update_crisis(supabase, crisis_id, payload)
    return success(data.model_dump(mode="json"))


@router.get("/reports/unlisted")
async def admin_unlisted_reports(_admin: AdminDep, supabase: SupabaseDep) -> dict:
    reports = await report_service.list_unlisted_reports(supabase)
    return success(reports)


@router.post("/reports/{report_id}/assign")
async def admin_assign_unlisted_report(
    report_id: str,
    payload: AdminAssignReportRequest,
    _admin: AdminDep,
    supabase: SupabaseDep,
) -> dict:
    report = await report_service.assign_unlisted_report(
        supabase, report_id, payload.crisis_id
    )
    crisis = await crisis_service.get_crisis(supabase, payload.crisis_id)
    body = AdminAssignReportResponse(report=report, crisis=crisis)
    return success(body.model_dump(mode="json"))


@router.post("/reports/{report_id}/create-crisis", status_code=status.HTTP_201_CREATED)
async def admin_create_crisis_from_report(
    report_id: str,
    payload: AdminCreateCrisisFromReportRequest,
    _admin: AdminDep,
    supabase: SupabaseDep,
) -> dict:
    crisis, report = await report_service.create_crisis_from_unlisted_report(
        supabase,
        report_id,
        name=payload.name,
        crisis_type=payload.crisis_type,
        crisis_subtype=payload.crisis_subtype,
        onset_at=payload.onset_at,
        epicenter_lat=payload.epicenter_lat,
        epicenter_lng=payload.epicenter_lng,
    )
    body = AdminAssignReportResponse(report=report, crisis=crisis)
    return success(body.model_dump(mode="json"))


@router.delete("/reports/{report_id}")
async def admin_delete_unlisted_report(
    report_id: str,
    _admin: AdminDep,
    supabase: SupabaseDep,
) -> dict:
    await report_service.delete_unlisted_report(supabase, report_id)
    return success({"deleted": True})
