import structlog
from fastapi import APIRouter, Depends

from app.dependencies import SettingsDep, SupabaseDep
from app.schemas.common import success
from app.schemas.geocode import GeocodeSearchQuery, ReverseGeocodeQuery, W3WDecodeQuery
from app.services import geocoding

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/geocode", tags=["geocode"])


@router.get("/reverse")
async def reverse_geocode(
    settings: SettingsDep,
    query: ReverseGeocodeQuery = Depends(),
) -> dict:
    data = await geocoding.reverse_geocode(settings, query.lat, query.lng)
    return success(data.model_dump(mode="json"))


@router.get("/search")
async def search_places(
    settings: SettingsDep,
    query: GeocodeSearchQuery = Depends(),
) -> dict:
    data = await geocoding.search_places(settings, query.q, query.limit)
    return success(data.model_dump(mode="json"))


@router.get("/w3w")
async def decode_w3w(
    settings: SettingsDep,
    query: W3WDecodeQuery = Depends(),
) -> dict:
    data = await geocoding.decode_what3words(settings, query.words)
    return success(data.model_dump(mode="json"))
