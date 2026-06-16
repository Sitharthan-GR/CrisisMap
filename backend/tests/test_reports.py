from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.services.supabase import SupabaseClient


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

LOCATION_ROW = {
    "id": "location-uuid-1",
    "latitude": 37.4954,
    "longitude": 36.9965,
    "what3words": "filled.count.soap",
    "admin_level_1": "Turkey",
    "admin_level_2": "Kahramanmaraş",
    "admin_level_3": "Dulkadiroğlu",
    "latest_damage_level": "partial",
    "report_count": 1,
    "last_updated_at": "2025-02-06T06:01:00+00:00",
}

REPORT_ROW = {
    "id": "report-uuid-1",
    "crisis_id": "crisis-uuid-1",
    "location_id": "location-uuid-1",
    "damage_level": "partial",
    "infra_type": "residential",
    "infra_subtype": "apartment",
    "infra_name": "Al Noor Building",
    "debris_present": True,
    "nature_of_crisis": "earthquake",
    "description_raw": "Building has collapsed on one side",
    "description_translated": None,
    "reporter_name": "anonymous",
    "source_language": "en",
    "is_latest_version": True,
    "version_number": 1,
    "submission_channel": "app",
    "status": "pending",
    "collected_at": "2025-02-06T06:00:00+00:00",
    "submitted_at": "2025-02-06T06:01:00+00:00",
}


@pytest.fixture
def mock_supabase() -> AsyncMock:
    client = AsyncMock(spec=SupabaseClient)
    client.insert.return_value = REPORT_ROW
    client.select.return_value = ([], 0)
    client.select_one.side_effect = _select_one_side_effect
    client.update.return_value = REPORT_ROW
    client.health_check.return_value = True
    return client


def _select_one_side_effect(table: str, **kwargs):
    filters = kwargs.get("filters", [])
    filter_map = {key: value for key, value in filters}

    if table == "crisis" and filter_map.get("id") == "eq.crisis-uuid-1":
        return CRISIS_ROW
    if table == "location":
        return LOCATION_ROW
    if table == "report":
        row = {**REPORT_ROW, "location": LOCATION_ROW}
        return row
    return None


@pytest.mark.asyncio
async def test_create_report(client: AsyncClient, mock_supabase, monkeypatch) -> None:
    mock_supabase.select.return_value = ([], 0)
    mock_supabase.insert.side_effect = [LOCATION_ROW, REPORT_ROW]

    async def fake_reverse_geocode(settings, lat, lng):
        from app.schemas.geocode import ReverseGeocodeOut

        return ReverseGeocodeOut(
            admin_level_1="Turkey",
            admin_level_2="Kahramanmaraş",
            admin_level_3="Dulkadiroğlu",
            display_name="Dulkadiroğlu, Kahramanmaraş, Turkey",
        )

    monkeypatch.setattr("app.services.reports.reverse_geocode", fake_reverse_geocode)

    response = await client.post(
        "/api/v1/reports",
        json={
            "crisis_id": "crisis-uuid-1",
            "damage_level": "partial",
            "infra_type": "residential",
            "infra_subtype": "apartment",
            "infra_name": "Al Noor Building",
            "debris_present": True,
            "nature_of_crisis": "earthquake",
            "description_raw": "Building has collapsed on one side",
            "source_language": "en",
            "submission_channel": "app",
            "collected_at": "2025-02-06T06:00:00Z",
            "location": {
                "latitude": 37.4954,
                "longitude": 36.9965,
                "what3words": "filled.count.soap",
                "location_method": "gps",
            },
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["error"] is None
    assert body["data"]["id"] == "report-uuid-1"
    assert body["data"]["location"]["admin_level_2"] == "Kahramanmaraş"


@pytest.mark.asyncio
async def test_get_report_includes_photos(client: AsyncClient, mock_supabase) -> None:
    mock_supabase.select.return_value = ([], 0)

    response = await client.get("/api/v1/reports/report-uuid-1")

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["photos"] == []
