from typing import Any

import httpx
import structlog

from app.core.exceptions import AppError

logger = structlog.get_logger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT = 30.0


def _ways_to_geojson(elements: list[dict[str, Any]]) -> dict[str, Any]:
    features: list[dict[str, Any]] = []

    for element in elements:
        if element.get("type") != "way":
            continue
        geometry = element.get("geometry")
        if not geometry or len(geometry) < 3:
            continue

        ring = [[point["lon"], point["lat"]] for point in geometry]
        if ring[0] != ring[-1]:
            ring.append(ring[0])

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "osm_id": str(element.get("id", "")),
                    "building": element.get("tags", {}).get("building", "yes"),
                    **element.get("tags", {}),
                },
                "geometry": {"type": "Polygon", "coordinates": [ring]},
            }
        )

    return {"type": "FeatureCollection", "features": features}


async def fetch_building_footprints(
    *,
    south: float,
    west: float,
    north: float,
    east: float,
) -> dict[str, Any]:
    """Fetch OSM building footprints from Overpass and return GeoJSON."""
    query = f"""
    [out:json][timeout:25];
    way["building"]({south},{west},{north},{east});
    out geom;
    """

    async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT) as client:
        try:
            response = await client.post(
                OVERPASS_URL,
                data={"data": query},
            )
        except httpx.RequestError as exc:
            logger.error("overpass_request_failed", error=str(exc))
            raise AppError(
                "Unable to reach building data service.",
                status_code=502,
                code="overpass_unreachable",
            ) from exc

    if response.status_code >= 400:
        raise AppError(
            "Building data service returned an error.",
            status_code=502,
            code="overpass_error",
            details={"status_code": response.status_code},
        )

    payload = response.json()
    geojson = _ways_to_geojson(payload.get("elements", []))
    logger.info("building_footprints_fetched", count=len(geojson["features"]))
    return geojson
