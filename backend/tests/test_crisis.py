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
    "is_unlisted": False,
    "onset_at": "2025-02-06T04:17:00+00:00",
    "created_at": "2025-02-06T04:30:00+00:00",
}

UNLISTED_CRISIS_ROW = {
    **CRISIS_ROW,
    "id": "unlisted-crisis-id",
    "name": "Unlisted",
    "crisis_subtype": "unlisted",
    "is_unlisted": True,
}


@pytest.mark.asyncio
async def test_list_crises(client: AsyncClient, mock_supabase) -> None:
    mock_supabase.select.return_value = ([CRISIS_ROW], 1)

    response = await client.get("/api/v1/crises")

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert len(body["data"]) == 1
    assert body["data"][0]["name"] == "Türkiye Earthquake 2025"
    mock_supabase.select.assert_called()
    call_filters = mock_supabase.select.call_args.kwargs.get("filters", [])
    assert ("is_unlisted", "eq.false") in call_filters


@pytest.mark.asyncio
async def test_reporting_options(client: AsyncClient, mock_supabase) -> None:
    mock_supabase.select.return_value = ([CRISIS_ROW], 1)
    mock_supabase.select_one.return_value = UNLISTED_CRISIS_ROW

    response = await client.get(
        "/api/v1/crises/reporting-options",
        params={"lat": 37.0, "lng": 37.0},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert len(body["data"]["crises"]) == 1
    assert body["data"]["unlisted_crisis_id"] == "unlisted-crisis-id"
    assert body["data"]["nearest_crisis_id"] == "crisis-uuid-1"


@pytest.mark.asyncio
async def test_unlisted_crisis_map_hidden(client: AsyncClient, mock_supabase) -> None:
    mock_supabase.select_one.return_value = UNLISTED_CRISIS_ROW

    response = await client.get("/api/v1/crises/unlisted-crisis-id/map")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_crisis_not_found(client: AsyncClient, mock_supabase) -> None:
    mock_supabase.select_one.return_value = None

    response = await client.get("/api/v1/crises/missing-id")

    assert response.status_code == 404
    body = response.json()
    assert body["data"] is None
    assert body["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_public_create_crisis_removed(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/crises",
        json={
            "name": "Test",
            "crisis_type": "natural_hazard",
            "crisis_subtype": "earthquake",
            "onset_at": "2025-02-06T04:17:00Z",
        },
    )

    assert response.status_code == 405
