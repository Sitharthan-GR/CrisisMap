import io
import zipfile
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.core.admin_auth import create_admin_token

EXPORT_REPORT_ROW = {
    "id": "report-uuid-1",
    "crisis_id": "crisis-uuid-1",
    "version_number": 1,
    "collected_at": "2025-06-01T12:00:00+00:00",
    "submitted_at": "2025-06-01T12:05:00+00:00",
    "damage_level": "partial",
    "infra_type": "residential",
    "infra_subtype": "house",
    "infra_name": "Home",
    "debris_present": True,
    "nature_of_crisis": "storm",
    "description_raw": "Roof damage",
    "description_translated": None,
    "reporter_name": "anonymous",
    "source_language": "en",
    "submission_channel": "web",
    "status": "validated",
    "location": {
        "latitude": 35.9606,
        "longitude": -83.9207,
        "what3words": "index.home.road",
        "admin_level_1": "Tennessee",
        "admin_level_2": "Knox County",
        "admin_level_3": "Knoxville",
    },
}

CRISIS_ROW = {
    "id": "crisis-uuid-1",
    "name": "Knoxville Storm",
    "crisis_type": "natural_hazard",
    "crisis_subtype": "storm",
    "epicenter_lat": 35.9606,
    "epicenter_lng": -83.9207,
    "status": "active",
    "is_unlisted": False,
    "onset_at": "2025-06-01T10:00:00+00:00",
    "created_at": "2025-06-01T10:00:00+00:00",
}


@pytest.fixture
def admin_token(monkeypatch) -> str:
    monkeypatch.setenv("ADMIN_PASSWORD", "test-admin-pass")
    from app.config import get_settings

    get_settings.cache_clear()
    return create_admin_token("test-admin-pass", ttl_seconds=3600)


def _mock_export_rows(mock_supabase: AsyncMock) -> None:
    async def select_side_effect(table, **kwargs):
        if table == "report":
            return ([EXPORT_REPORT_ROW], 1)
        if table == "photo":
            return (
                [
                    {
                        "id": "photo-1",
                        "report_id": "report-uuid-1",
                        "storage_url": "crisis-uuid-1/report-uuid-1/original_photo-1.jpg",
                    }
                ],
                1,
            )
        if table == "crisis":
            return ([CRISIS_ROW], 1)
        return ([], 0)

    mock_supabase.select.side_effect = select_side_effect
    mock_supabase.create_signed_url.return_value = (
        "https://test-project.supabase.co/storage/v1/object/sign/rapida-photos/"
        "crisis-uuid-1/report-uuid-1/original_photo-1.jpg?token=test"
    )


@pytest.mark.asyncio
async def test_export_csv(client: AsyncClient, mock_supabase: AsyncMock) -> None:
    _mock_export_rows(mock_supabase)

    response = await client.get("/api/v1/crises/crisis-uuid-1/export/csv?status=all")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "report-uuid-1" in response.text
    assert "Knox County" in response.text
    assert "crisis_name" in response.text
    assert "photo_urls" in response.text
    assert "original_photo-1.jpg" in response.text


@pytest.mark.asyncio
async def test_export_geojson(client: AsyncClient, mock_supabase: AsyncMock) -> None:
    _mock_export_rows(mock_supabase)

    response = await client.get(
        "/api/v1/crises/crisis-uuid-1/export/geojson?status=all",
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/geo+json")
    assert "FeatureCollection" in response.text
    assert "report-uuid-1" in response.text
    assert "photo_urls" in response.text
    assert "original_photo-1.jpg" in response.text


@pytest.mark.asyncio
async def test_admin_export_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/api/v1/admin/export/shapefile?crisis_id=all")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_export_shapefile_success(
    client: AsyncClient,
    mock_supabase: AsyncMock,
    admin_token: str,
) -> None:
    _mock_export_rows(mock_supabase)

    response = await client.get(
        "/api/v1/admin/export/shapefile?crisis_id=crisis-uuid-1&include=all",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = set(archive.namelist())
        assert {"reports.shp", "reports.shx", "reports.dbf", "reports.prj"}.issubset(names)


@pytest.mark.asyncio
async def test_admin_export_all_crises_csv(
    client: AsyncClient,
    mock_supabase: AsyncMock,
    admin_token: str,
) -> None:
    _mock_export_rows(mock_supabase)

    response = await client.get(
        "/api/v1/admin/export/csv?crisis_id=all&include=all",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert "all_crises" in response.headers.get("content-disposition", "")
