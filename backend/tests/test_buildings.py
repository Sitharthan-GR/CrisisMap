from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


OVERPASS_FIXTURE = {
    "elements": [
        {
            "type": "way",
            "id": 1,
            "tags": {"building": "yes", "name": "City Hall"},
            "geometry": [
                {"lat": 35.96, "lon": -83.92},
                {"lat": 35.961, "lon": -83.92},
                {"lat": 35.961, "lon": -83.919},
                {"lat": 35.96, "lon": -83.919},
            ],
        }
    ]
}


@pytest.mark.asyncio
async def test_building_footprints_returns_geojson(client: AsyncClient) -> None:
    with patch(
        "app.api.v1.buildings.fetch_building_footprints",
        new_callable=AsyncMock,
    ) as mock_fetch:
        mock_fetch.return_value = {
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": {}, "geometry": {}}],
        }

        response = await client.get(
            "/api/v1/buildings/footprints",
            params={"south": 35.95, "west": -83.93, "north": 35.97, "east": -83.91},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1
    mock_fetch.assert_awaited_once()


@pytest.mark.asyncio
async def test_building_footprints_rejects_large_bbox(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/buildings/footprints",
        params={"south": 35.0, "west": -84.0, "north": 36.0, "east": -83.0},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_osm_to_geojson_converter() -> None:
    from app.services.buildings import _ways_to_geojson

    geojson = _ways_to_geojson(OVERPASS_FIXTURE["elements"])
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 1
    assert geojson["features"][0]["geometry"]["type"] == "Polygon"
    assert geojson["features"][0]["properties"]["name"] == "City Hall"
