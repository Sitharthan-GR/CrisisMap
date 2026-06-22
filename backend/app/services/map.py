import asyncio
from collections import Counter, defaultdict
from typing import Any

import structlog

from app.core.exceptions import ValidationError
from app.schemas.map import ClusterQuery, GeoJsonFeature, MapFeatureCollection, MapQuery
from app.services.crisis import get_crisis
from app.services.supabase import SupabaseClient

logger = structlog.get_logger(__name__)

DAMAGE_RANK = {"minimal": 1, "partial": 2, "complete": 3}


def parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    parts = [part.strip() for part in bbox.split(",")]
    if len(parts) != 4:
        raise ValidationError("bbox must be minLng,minLat,maxLng,maxLat")
    try:
        min_lng, min_lat, max_lng, max_lat = (float(part) for part in parts)
    except ValueError as exc:
        raise ValidationError("bbox values must be numeric") from exc
    if min_lng >= max_lng or min_lat >= max_lat:
        raise ValidationError("bbox min values must be less than max values")
    return min_lng, min_lat, max_lng, max_lat


def _geohash_center(geohash: str) -> tuple[float, float]:
    bits = [16, 8, 4, 2, 1]
    lat_interval = [-90.0, 90.0]
    lng_interval = [-180.0, 180.0]
    even = True
    for char in geohash:
        value = "0123456789bcdefghjkmnpqrstuvwxyz".index(char)
        for mask in bits:
            if even:
                mid = sum(lng_interval) / 2
                if value & mask:
                    lng_interval[0] = mid
                else:
                    lng_interval[1] = mid
            else:
                mid = sum(lat_interval) / 2
                if value & mask:
                    lat_interval[0] = mid
                else:
                    lat_interval[1] = mid
            even = not even
    return (sum(lng_interval) / 2, sum(lat_interval) / 2)


async def _fetch_map_pins_rpc(
    supabase: SupabaseClient,
    crisis_id: str,
    query: MapQuery,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "p_crisis_id": crisis_id,
        "p_status": query.status,
        "p_damage_level": query.damage_level,
        "p_infra_type": query.infra_type,
        "p_min_lng": None,
        "p_min_lat": None,
        "p_max_lng": None,
        "p_max_lat": None,
    }
    if query.bbox:
        min_lng, min_lat, max_lng, max_lat = parse_bbox(query.bbox)
        params.update(
            {
                "p_min_lng": min_lng,
                "p_min_lat": min_lat,
                "p_max_lng": max_lng,
                "p_max_lat": max_lat,
            }
        )

    result = await supabase.rpc("get_crisis_map_pins", params)
    return result or []


async def _sign_thumbnail_urls(
    supabase: SupabaseClient,
    storage_paths: set[str],
) -> dict[str, str | None]:
    if not storage_paths:
        return {}

    async def sign(path: str) -> tuple[str, str | None]:
        try:
            url = await supabase.create_signed_url(
                path,
                transform={"width": 300, "height": 300},
            )
            return path, url
        except Exception:
            logger.warning("map_thumbnail_sign_failed", storage_path=path)
            return path, None

    signed = await asyncio.gather(*(sign(path) for path in storage_paths))
    return dict(signed)


async def get_crisis_map(
    supabase: SupabaseClient, crisis_id: str, query: MapQuery
) -> MapFeatureCollection:
    await get_crisis(supabase, crisis_id)
    rows = await _fetch_map_pins_rpc(supabase, crisis_id, query)

    storage_paths = {
        path
        for row in rows
        if (path := row.get("latest_photo_storage_url"))
    }
    signed_urls = await _sign_thumbnail_urls(supabase, storage_paths)

    features: list[GeoJsonFeature] = []
    for row in rows:
        lat = row.get("latitude")
        lng = row.get("longitude")
        if lat is None or lng is None:
            continue
        storage_path = row.get("latest_photo_storage_url")
        features.append(
            GeoJsonFeature(
                geometry={"type": "Point", "coordinates": [lng, lat]},
                properties={
                    "location_id": row["location_id"],
                    "report_id": row["report_id"],
                    "damage_level": row["damage_level"],
                    "infra_type": row["infra_type"],
                    "nature_of_crisis": row.get("nature_of_crisis"),
                    "report_count": row.get("report_count", 0),
                    "admin_level_2": row.get("admin_level_2"),
                    "latest_photo_thumbnail": signed_urls.get(storage_path)
                    if storage_path
                    else None,
                },
            )
        )

    return MapFeatureCollection(features=features, total=len(features))


async def get_crisis_map_clusters(
    supabase: SupabaseClient, crisis_id: str, query: ClusterQuery
) -> MapFeatureCollection:
    await get_crisis(supabase, crisis_id)
    map_query = MapQuery(bbox=query.bbox, status="all")
    rows = await _fetch_map_pins_rpc(supabase, crisis_id, map_query)

    clusters: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        geohash = row.get("geohash")
        if not geohash:
            continue
        prefix = geohash[: query.precision]
        clusters[prefix].append(row["damage_level"])

    features: list[GeoJsonFeature] = []
    for geohash, damage_levels in clusters.items():
        counts = Counter(damage_levels)
        dominant = max(
            counts.keys(),
            key=lambda level: (counts[level], DAMAGE_RANK.get(level, 0)),
        )
        lng, lat = _geohash_center(geohash)
        features.append(
            GeoJsonFeature(
                geometry={"type": "Point", "coordinates": [lng, lat]},
                properties={
                    "geohash": geohash,
                    "count": len(damage_levels),
                    "dominant_damage_level": dominant,
                },
            )
        )

    return MapFeatureCollection(features=features)
