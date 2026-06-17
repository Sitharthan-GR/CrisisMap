import structlog
from fastapi import APIRouter, Depends

from app.dependencies import SupabaseDep
from app.schemas.common import success
from app.schemas.map import ClusterQuery, MapQuery
from app.schemas.report import CrisisReportsQuery
from app.services import crisis as crisis_service
from app.services import map as map_service
from app.services import reports as report_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/crises", tags=["map"])


@router.get("/{crisis_id}/reports")
async def list_crisis_reports(
    crisis_id: str,
    supabase: SupabaseDep,
    query: CrisisReportsQuery = Depends(),
) -> dict:
    await crisis_service.assert_public_crisis(supabase, crisis_id)
    data = await report_service.list_crisis_reports(supabase, crisis_id, query)
    return success(data.model_dump(mode="json"))


@router.get("/{crisis_id}/map")
async def get_crisis_map(
    crisis_id: str,
    supabase: SupabaseDep,
    query: MapQuery = Depends(),
) -> dict:
    await crisis_service.assert_public_crisis(supabase, crisis_id)
    data = await map_service.get_crisis_map(supabase, crisis_id, query)
    return success(data.model_dump(mode="json"))


@router.get("/{crisis_id}/map/clusters")
async def get_crisis_map_clusters(
    crisis_id: str,
    supabase: SupabaseDep,
    query: ClusterQuery = Depends(),
) -> dict:
    await crisis_service.assert_public_crisis(supabase, crisis_id)
    data = await map_service.get_crisis_map_clusters(supabase, crisis_id, query)
    return success(data.model_dump(mode="json"))
