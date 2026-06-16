import pytest
from httpx import AsyncClient


CRISIS_ROW = {
    "id": "crisis-uuid-1",
    "name": "Türkiye Earthquake 2025",
    "crisis_type": "natural_hazard",
    "crisis_subtype": "earthquake",
    "epicenter_lat": 37.5,
    "epicenter_lng": 37.0,
    "status": "active",
    "onset_at": "2025-02-06T04:17:00+00:00",
    "created_at": "2025-02-06T04:30:00+00:00",
}


@pytest.mark.asyncio
async def test_create_crisis(client: AsyncClient, mock_supabase) -> None:
    mock_supabase.insert.return_value = CRISIS_ROW

    response = await client.post(
        "/api/v1/crises",
        json={
            "name": "Türkiye Earthquake 2025",
            "crisis_type": "natural_hazard",
            "crisis_subtype": "earthquake",
            "epicenter_lat": 37.5,
            "epicenter_lng": 37.0,
            "onset_at": "2025-02-06T04:17:00Z",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["error"] is None
    assert body["data"]["id"] == "crisis-uuid-1"
    assert body["data"]["status"] == "active"
    mock_supabase.insert.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_crises(client: AsyncClient, mock_supabase) -> None:
    mock_supabase.select.return_value = ([CRISIS_ROW], 1)

    response = await client.get("/api/v1/crises")

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert len(body["data"]) == 1
    assert body["data"][0]["name"] == "Türkiye Earthquake 2025"


@pytest.mark.asyncio
async def test_get_crisis_not_found(client: AsyncClient, mock_supabase) -> None:
    mock_supabase.select_one.return_value = None

    response = await client.get("/api/v1/crises/missing-id")

    assert response.status_code == 404
    body = response.json()
    assert body["data"] is None
    assert body["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_create_crisis_validation_error(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/crises",
        json={"name": "Test", "crisis_type": "invalid", "crisis_subtype": "x"},
    )

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
