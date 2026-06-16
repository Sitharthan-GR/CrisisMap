import structlog
from fastapi import APIRouter, HTTPException, Query, status

from app.services.buildings import fetch_building_footprints

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/buildings", tags=["buildings"])

MAX_BBOX_SPAN = 0.04


@router.get(
    "/footprints",
    summary="Get building footprints for map viewport",
    description=(
        "Returns OpenStreetMap building polygons as GeoJSON for the given "
        "bounding box. Proxied via Overpass API (zoom in for best results)."
    ),
)
async def get_building_footprints(
    south: float = Query(..., ge=-90, le=90),
    west: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
) -> dict:
    if south >= north:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="south must be less than north",
        )
    if west >= east:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="west must be less than east",
        )
    if (north - south) > MAX_BBOX_SPAN or (east - west) > MAX_BBOX_SPAN:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Bounding box too large — zoom in closer",
        )

    logger.info(
        "building_footprints_requested",
        south=south,
        west=west,
        north=north,
        east=east,
    )
    return await fetch_building_footprints(
        south=south,
        west=west,
        north=north,
        east=east,
    )
