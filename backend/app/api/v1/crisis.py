import structlog
from fastapi import APIRouter, Depends, status

from app.dependencies import SettingsDep, SupabaseDep
from app.schemas.crisis import NearbyCrisisQuery, NearbyCrisisResponse, parse_rpc_records

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/crises", tags=["crises"])


@router.get(
    "/nearby",
    response_model=NearbyCrisisResponse,
    status_code=status.HTTP_200_OK,
    summary="Get nearby crisis records",
    description=(
        "Calls Supabase RPC `get_nearby_crisis_records` with user location "
        "and search radius."
    ),
)
async def get_nearby_crises(
    supabase: SupabaseDep,
    settings: SettingsDep,
    query: NearbyCrisisQuery = Depends(),
) -> NearbyCrisisResponse:
    """
    Fetch crisis records near a location.

    Equivalent to:
    ```js
    supabase.rpc('get_nearby_crisis_records', {
      user_lat: 35.9606,
      user_lng: -83.9207,
      radius_meters: 10000
    })
    ```
    """
    logger.info(
        "get_nearby_crises_requested",
        user_lat=query.user_lat,
        user_lng=query.user_lng,
        radius_meters=query.radius_meters,
    )

    data = await supabase.rpc(
        settings.supabase_nearby_crisis_rpc,
        query.to_rpc_params(),
    )
    records = parse_rpc_records(data)

    return NearbyCrisisResponse(records=records, count=len(records))
