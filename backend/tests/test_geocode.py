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


def test_format_bigdatacloud_display_name() -> None:
    label = geocoding._format_bigdatacloud_display_name(
        {
            "locality": "Knoxville",
            "city": "Knoxville",
            "principalSubdivision": "Tennessee",
            "postcode": "37916",
            "countryName": "United States of America (the)",
        }
    )
    assert "Knoxville" in label
    assert "Tennessee" in label
    assert "37916" in label
    assert "United States of America" in label


@pytest.mark.asyncio
async def test_reverse_geocode_falls_back_to_photon(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    geocoding.clear_reverse_geocode_cache()

    async def fake_photon(settings, lat: float, lng: float):
        from app.schemas.geocode import ReverseGeocodeOut

        return ReverseGeocodeOut(
            admin_level_1="United States",
            admin_level_2="TN",
            admin_level_3="Knoxville",
            display_name="316 James Agee Street, Knoxville, TN, United States",
        )

    async def fake_bigdatacloud(lat: float, lng: float) -> None:
        return None

    async def fake_nominatim(settings, lat: float, lng: float) -> None:
        return None

    monkeypatch.setattr(geocoding, "_photon_reverse", fake_photon)
    monkeypatch.setattr(geocoding, "_bigdatacloud_reverse", fake_bigdatacloud)
    monkeypatch.setattr(geocoding, "_nominatim_reverse", fake_nominatim)

    response = await client.get(
        "/api/v1/geocode/reverse",
        params={"lat": 35.961024, "lng": -83.929729},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert "James Agee Street" in body["data"]["display_name"]


@pytest.mark.asyncio
async def test_reverse_geocode_falls_back_to_bigdatacloud(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    geocoding.clear_reverse_geocode_cache()

    async def fake_photon(settings, lat: float, lng: float) -> None:
        return None

    async def fake_bigdatacloud(lat: float, lng: float):
        from app.schemas.geocode import ReverseGeocodeOut

        return ReverseGeocodeOut(
            admin_level_1="United States of America",
            admin_level_2="Tennessee",
            admin_level_3="Knoxville",
            display_name="Knoxville, Tennessee 37916, United States of America",
        )

    monkeypatch.setattr(geocoding, "_photon_reverse", fake_photon)
    monkeypatch.setattr(geocoding, "_bigdatacloud_reverse", fake_bigdatacloud)
    monkeypatch.setattr(geocoding, "_nominatim_reverse", lambda *a, **k: None)

    response = await client.get(
        "/api/v1/geocode/reverse",
        params={"lat": 35.961143, "lng": -83.929685},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert "Knoxville" in body["data"]["display_name"]
