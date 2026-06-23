import ipaddress
import math
from typing import Any

import httpx
import structlog

from app.config import Settings
from app.core.exceptions import GeocodeError
from app.schemas.geocode import (
    GeocodeSearchOut,
    GeocodeSearchResult,
    IpLocationOut,
    ReverseGeocodeOut,
    W3WDecodeOut,
)

logger = structlog.get_logger(__name__)

_HTTP_CLIENT_KWARGS = {"timeout": 15.0, "follow_redirects": True}
_reverse_geocode_cache: dict[str, ReverseGeocodeOut] = {}


def _reverse_cache_key(lat: float, lng: float) -> str:
    return f"{round(lat, 5)},{round(lng, 5)}"


def clear_reverse_geocode_cache() -> None:
    _reverse_geocode_cache.clear()


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _extract_admin_levels(address: dict[str, str]) -> tuple[str | None, str | None, str | None]:
    country = address.get("country")
    state = address.get("state") or address.get("region")
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("county")
        or address.get("suburb")
    )
    return country, state, city


def _format_photon_display_name(properties: dict[str, Any]) -> str:
    parts: list[str] = []
    street_line = " ".join(
        part
        for part in (properties.get("housenumber"), properties.get("street"))
        if part
    ).strip()
    if street_line:
        parts.append(street_line)

    for key in ("locality", "district", "city", "county", "state", "country"):
        value = properties.get(key)
        if not value:
            continue
        text = str(value).strip()
        if text and (not parts or parts[-1] != text):
            parts.append(text)

    return ", ".join(parts)


def _format_bigdatacloud_display_name(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    city = payload.get("locality") or payload.get("city")
    state = payload.get("principalSubdivision")
    postcode = payload.get("postcode")
    country = str(payload.get("countryName") or "").replace(" (the)", "").strip()

    if city:
        parts.append(str(city))
    if state and str(state) not in parts:
        parts.append(str(state))
    if postcode and parts:
        parts[-1] = f"{parts[-1]} {postcode}"
    elif postcode:
        parts.append(str(postcode))
    if country and country not in parts:
        parts.append(country)
    return ", ".join(parts)


async def _nominatim_reverse(
    settings: Settings,
    lat: float,
    lng: float,
) -> ReverseGeocodeOut | None:
    url = f"{settings.nominatim_base_url}/reverse"
    params = {
        "lat": str(lat),
        "lon": str(lng),
        "format": "jsonv2",
        "addressdetails": "1",
    }
    headers = {"User-Agent": settings.nominatim_user_agent}

    async with httpx.AsyncClient(**_HTTP_CLIENT_KWARGS) as client:
        try:
            response = await client.get(url, params=params, headers=headers)
        except httpx.RequestError as exc:
            logger.warning("nominatim_request_failed", error=str(exc))
            return None

    if response.status_code >= 400:
        logger.warning(
            "nominatim_reverse_failed",
            status_code=response.status_code,
            lat=lat,
            lng=lng,
        )
        return None

    try:
        payload = response.json()
    except ValueError:
        return None

    address = payload.get("address", {})
    admin1, admin2, admin3 = _extract_admin_levels(address)
    display_name = payload.get("display_name")
    if not display_name and not any((admin1, admin2, admin3)):
        return None

    return ReverseGeocodeOut(
        admin_level_1=admin1,
        admin_level_2=admin2,
        admin_level_3=admin3,
        display_name=display_name,
    )


async def _photon_reverse(
    settings: Settings,
    lat: float,
    lng: float,
) -> ReverseGeocodeOut | None:
    url = "https://photon.komoot.io/reverse"
    params = {"lat": str(lat), "lon": str(lng)}
    headers = {"User-Agent": settings.nominatim_user_agent}

    async with httpx.AsyncClient(**_HTTP_CLIENT_KWARGS) as client:
        try:
            response = await client.get(url, params=params, headers=headers)
        except httpx.RequestError as exc:
            logger.warning("photon_request_failed", error=str(exc))
            return None

    if response.status_code >= 400:
        logger.warning(
            "photon_reverse_failed",
            status_code=response.status_code,
            lat=lat,
            lng=lng,
        )
        return None

    try:
        payload = response.json()
    except ValueError:
        return None

    features = payload.get("features") or []
    if not features:
        return None

    properties = features[0].get("properties") or {}
    display_name = _format_photon_display_name(properties)
    if not display_name:
        return None

    return ReverseGeocodeOut(
        admin_level_1=properties.get("country"),
        admin_level_2=properties.get("state"),
        admin_level_3=properties.get("city") or properties.get("locality"),
        display_name=display_name,
    )


async def _bigdatacloud_reverse(lat: float, lng: float) -> ReverseGeocodeOut | None:
    url = "https://api.bigdatacloud.net/data/reverse-geocode-client"
    params = {
        "latitude": str(lat),
        "longitude": str(lng),
        "localityLanguage": "en",
    }

    async with httpx.AsyncClient(**_HTTP_CLIENT_KWARGS) as client:
        try:
            response = await client.get(url, params=params)
        except httpx.RequestError as exc:
            logger.warning("bigdatacloud_request_failed", error=str(exc))
            return None

    if response.status_code >= 400:
        logger.warning(
            "bigdatacloud_reverse_failed",
            status_code=response.status_code,
            lat=lat,
            lng=lng,
        )
        return None

    try:
        payload = response.json()
    except ValueError:
        return None

    display_name = _format_bigdatacloud_display_name(payload)
    if not display_name:
        return None

    country = str(payload.get("countryName") or "").replace(" (the)", "").strip() or None
    return ReverseGeocodeOut(
        admin_level_1=country,
        admin_level_2=payload.get("principalSubdivision"),
        admin_level_3=payload.get("city") or payload.get("locality"),
        display_name=display_name,
    )


async def reverse_geocode(settings: Settings, lat: float, lng: float) -> ReverseGeocodeOut:
    cache_key = _reverse_cache_key(lat, lng)
    cached = _reverse_geocode_cache.get(cache_key)
    if cached is not None:
        return cached

    result = await _photon_reverse(settings, lat, lng)
    if result is None:
        result = await _bigdatacloud_reverse(lat, lng)
    if result is None:
        result = await _nominatim_reverse(settings, lat, lng)
    if result is None:
        raise GeocodeError("Reverse geocoding service returned an error.")

    _reverse_geocode_cache[cache_key] = result
    return result


async def search_places(
    settings: Settings,
    query: str,
    limit: int = 5,
) -> GeocodeSearchOut:
    url = f"{settings.nominatim_base_url}/search"
    params = {
        "q": query.strip(),
        "format": "jsonv2",
        "limit": str(limit),
        "addressdetails": "1",
    }
    headers = {"User-Agent": settings.nominatim_user_agent}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(url, params=params, headers=headers)
        except httpx.RequestError as exc:
            logger.error("nominatim_search_failed", error=str(exc))
            raise GeocodeError("Place search service unreachable.") from exc

    if response.status_code >= 400:
        raise GeocodeError("Place search service returned an error.")

    payload = response.json()
    if not isinstance(payload, list):
        raise GeocodeError("Place search returned an unexpected response.")

    results: list[GeocodeSearchResult] = []
    for item in payload:
        lat_raw = item.get("lat")
        lon_raw = item.get("lon")
        display_name = item.get("display_name")
        if lat_raw is None or lon_raw is None or not display_name:
            continue
        try:
            results.append(
                GeocodeSearchResult(
                    display_name=display_name,
                    latitude=float(lat_raw),
                    longitude=float(lon_raw),
                    place_id=item.get("place_id"),
                    place_type=item.get("type"),
                )
            )
        except (TypeError, ValueError):
            continue

    return GeocodeSearchOut(results=results)


async def decode_what3words(settings: Settings, words: str) -> W3WDecodeOut:
    if not settings.what3words_api_key:
        raise GeocodeError("what3words API key is not configured.")

    normalized = words.strip().lower()
    url = f"{settings.what3words_api_url}/convert-to-coordinates"
    params = {"words": normalized, "key": settings.what3words_api_key}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(url, params=params)
        except httpx.RequestError as exc:
            logger.error("w3w_request_failed", error=str(exc))
            raise GeocodeError("what3words service unreachable.") from exc

    if response.status_code >= 400:
        raise GeocodeError("what3words decode failed.")

    payload: dict[str, Any] = response.json()
    coordinates = payload.get("coordinates") or {}
    return W3WDecodeOut(
        latitude=coordinates["lat"],
        longitude=coordinates["lng"],
        words=normalized,
        nearest_place=payload.get("nearestPlace"),
    )


def is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip.strip())
        return not (
            addr.is_private
            or addr.is_loopback
            or addr.is_reserved
            or addr.is_link_local
        )
    except ValueError:
        return False


def extract_client_ip(
    *,
    forwarded_for: str | None,
    real_ip: str | None,
    direct_host: str | None,
) -> str:
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if real_ip:
        return real_ip.strip()
    return (direct_host or "127.0.0.1").strip()


async def geolocate_ip(settings: Settings, ip: str) -> IpLocationOut:
    if not is_public_ip(ip):
        logger.info("ip_geolocation_skipped", ip=ip, reason="private_or_local")
        return IpLocationOut(available=False)

    url = f"{settings.ip_geolocation_base_url}/{ip}"
    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            response = await client.get(url)
        except httpx.RequestError as exc:
            logger.warning("ip_geolocation_failed", ip=ip, error=str(exc))
            return IpLocationOut(available=False)

    if response.status_code >= 400:
        return IpLocationOut(available=False)

    payload = response.json()
    if not payload.get("success"):
        return IpLocationOut(available=False)

    try:
        lat = float(payload["latitude"])
        lng = float(payload["longitude"])
    except (KeyError, TypeError, ValueError):
        return IpLocationOut(available=False)

    return IpLocationOut(
        available=True,
        latitude=lat,
        longitude=lng,
        country=payload.get("country"),
        city=payload.get("city"),
    )
