from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.core.admin_auth import create_admin_token


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


@pytest.fixture
def admin_token(monkeypatch) -> str:
    monkeypatch.setenv("ADMIN_PASSWORD", "test-admin-pass")
    from app.config import get_settings

    get_settings.cache_clear()
    return create_admin_token("test-admin-pass", ttl_seconds=3600)


@pytest.mark.asyncio
async def test_admin_login_success(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setenv("ADMIN_PASSWORD", "test-admin-pass")
    from app.config import get_settings

    get_settings.cache_clear()

    response = await client.post(
        "/api/v1/admin/login",
        json={"password": "test-admin-pass"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["data"]["token"]


@pytest.mark.asyncio
async def test_admin_login_invalid_password(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setenv("ADMIN_PASSWORD", "test-admin-pass")
    from app.config import get_settings

    get_settings.cache_clear()

    response = await client.post(
        "/api/v1/admin/login",
        json={"password": "wrong"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_create_crisis(
    client: AsyncClient, mock_supabase, admin_token: str
) -> None:
    mock_supabase.insert.return_value = CRISIS_ROW

    response = await client.post(
        "/api/v1/admin/crises",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Türkiye Earthquake 2025",
            "crisis_type": "natural_hazard",
            "crisis_subtype": "earthquake",
            "onset_at": "2025-02-06T04:17:00Z",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["data"]["status"] == "active"


@pytest.mark.asyncio
async def test_admin_create_crisis_requires_auth(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/admin/crises",
        json={
            "name": "Test",
            "crisis_type": "natural_hazard",
            "crisis_subtype": "earthquake",
            "onset_at": "2025-02-06T04:17:00Z",
        },
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_dashboard(
    client: AsyncClient, mock_supabase, admin_token: str
) -> None:
    mock_supabase.rpc.return_value = {
        "crises": [CRISIS_ROW],
        "stats": {
            "crisis-uuid-1": {
                "total": 10,
                "sev": {"complete": 3, "partial": 4, "minimal": 3},
            }
        },
        "unlisted_count": 2,
    }

    response = await client.get(
        "/api/v1/admin/dashboard",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert len(body["data"]["crises"]) == 1
    assert body["data"]["stats"]["crisis-uuid-1"]["total"] == 10
    assert body["data"]["unlisted_count"] == 2
    mock_supabase.rpc.assert_awaited_with("get_admin_dashboard_data", {})


@pytest.mark.asyncio
async def test_admin_list_all_crises(
    client: AsyncClient, mock_supabase, admin_token: str
) -> None:
    mock_supabase.select.return_value = ([CRISIS_ROW], 1)

    response = await client.get(
        "/api/v1/admin/crises",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1


@pytest.mark.asyncio
async def test_admin_update_crisis_status(
    client: AsyncClient, mock_supabase, admin_token: str
) -> None:
    mock_supabase.select_one.return_value = CRISIS_ROW
    mock_supabase.update.return_value = {**CRISIS_ROW, "status": "closed"}

    response = await client.patch(
        "/api/v1/admin/crises/crisis-uuid-1",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "closed"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "closed"


@pytest.mark.asyncio
async def test_admin_unlisted_reports(
    client: AsyncClient, mock_supabase, admin_token: str, monkeypatch
) -> None:
    from app.services import reports as report_service

    async def fake_list_unlisted(_supabase):
        return [
            {
                "id": "report-1",
                "crisis_id": "unlisted-crisis-id",
                "damage_level": "partial",
                "photos": [],
            }
        ]

    monkeypatch.setattr(report_service, "list_unlisted_reports", fake_list_unlisted)

    response = await client.get(
        "/api/v1/admin/reports/unlisted",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["data"][0]["id"] == "report-1"


@pytest.mark.asyncio
async def test_admin_delete_report(
    client: AsyncClient,
    mock_supabase,
    admin_token: str,
    monkeypatch,
) -> None:
    from app.services import reports as report_service

    delete_mock = AsyncMock()
    monkeypatch.setattr(report_service, "delete_report", delete_mock)

    response = await client.delete(
        "/api/v1/admin/reports/report-uuid-1",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["deleted"] is True
    delete_mock.assert_awaited_once()
