import structlog
from fastapi import APIRouter, Depends, status

from app.dependencies import SettingsDep, SupabaseDep
from app.schemas.common import success
from app.schemas.crisis import CrisisCreate, CrisisListQuery, CrisisUpdate
from app.services import crisis as crisis_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/crises", tags=["crises"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_crisis(
    payload: CrisisCreate,
    supabase: SupabaseDep,
) -> dict:
    data = await crisis_service.create_crisis(supabase, payload)
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


@router.patch("/{crisis_id}")
async def update_crisis(
    crisis_id: str,
    payload: CrisisUpdate,
    supabase: SupabaseDep,
) -> dict:
    data = await crisis_service.update_crisis(supabase, crisis_id, payload)
    return success(data.model_dump(mode="json"))
