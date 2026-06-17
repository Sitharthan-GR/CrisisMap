import structlog
from fastapi import APIRouter, Depends, Query

from app.dependencies import SupabaseDep
from app.schemas.common import success
from app.schemas.crisis import CrisisListQuery
from app.services import crisis as crisis_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/crises", tags=["crises"])


@router.get("/reporting-options")
async def reporting_options(
    supabase: SupabaseDep,
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
) -> dict:
    data = await crisis_service.get_reporting_options(supabase, lat=lat, lng=lng)
    return success(data.model_dump(mode="json"))


@router.get("")
async def list_crises(
    supabase: SupabaseDep,
    query: CrisisListQuery = Depends(),
) -> dict:
    crises = await crisis_service.list_crises(supabase, query)
    return success([item.model_dump(mode="json") for item in crises])


@router.get("/{crisis_id}")
async def get_crisis(crisis_id: str, supabase: SupabaseDep) -> dict:
    data = await crisis_service.get_crisis(supabase, crisis_id)
    return success(data.model_dump(mode="json"))
