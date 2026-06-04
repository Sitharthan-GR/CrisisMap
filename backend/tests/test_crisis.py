import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_nearby_crises_calls_supabase_rpc(
    client: AsyncClient, mock_supabase
) -> None:
    response = await client.get(
        "/api/v1/crises/nearby",
        params={
            "user_lat": 35.9606,
            "user_lng": -83.9207,
            "radius_meters": 10000,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["records"][0]["title"] == "Road blocked by flood"

    mock_supabase.rpc.assert_awaited_once()
    call_args = mock_supabase.rpc.await_args
    assert call_args.args[0] == "get_nearby_crisis_records"
    assert call_args.args[1] == {
        "user_lat": 35.9606,
        "user_lng": -83.9207,
        "radius_meters": 10000,
    }


@pytest.mark.asyncio
async def test_get_nearby_crises_validation_error(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/crises/nearby",
        params={"user_lat": 999, "user_lng": -83.9207, "radius_meters": 10000},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_nearby_crises_missing_params(client: AsyncClient) -> None:
    response = await client.get("/api/v1/crises/nearby")
    assert response.status_code == 422
