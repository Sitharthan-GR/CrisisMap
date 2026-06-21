import pytest
from httpx import AsyncClient

from app.services import geocoding


@pytest.mark.parametrize(
    ("ip", "expected"),
    [
        ("127.0.0.1", False),
        ("10.0.0.5", False),
        ("192.168.1.20", False),
        ("8.8.8.8", True),
        ("2001:4860:4860::8888", True),
    ],
)
def test_is_public_ip(ip: str, expected: bool) -> None:
    assert geocoding.is_public_ip(ip) is expected


def test_extract_client_ip_prefers_forwarded_header() -> None:
    ip = geocoding.extract_client_ip(
        forwarded_for="203.0.113.50, 10.0.0.1",
        real_ip="198.51.100.2",
        direct_host="127.0.0.1",
    )
    assert ip == "203.0.113.50"


@pytest.mark.asyncio
async def test_ip_location_private_ip(client: AsyncClient) -> None:
    response = await client.get("/api/v1/geocode/ip-location")

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["data"]["available"] is False


@pytest.mark.asyncio
async def test_ip_location_public_ip(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeResponse:
        status_code = 200

        @staticmethod
        def json() -> dict:
            return {
                "success": True,
                "latitude": 50.45,
                "longitude": 30.52,
                "country": "Ukraine",
                "city": "Kyiv",
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(self, url: str):
            assert "8.8.8.8" in url
            return FakeResponse()

    monkeypatch.setattr(geocoding.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    monkeypatch.setattr(
        geocoding,
        "extract_client_ip",
        lambda **kwargs: "8.8.8.8",
    )

    response = await client.get("/api/v1/geocode/ip-location")

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["available"] is True
    assert body["data"]["latitude"] == 50.45
    assert body["data"]["country"] == "Ukraine"
