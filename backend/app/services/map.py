from collections import Counter, defaultdict
from typing import Any

import structlog

from app.core.exceptions import ValidationError
from app.schemas.map import ClusterQuery, GeoJsonFeature, MapFeatureCollection, MapQuery
from app.services.crisis import get_crisis
from app.services.photos import latest_photo_thumbnail_for_location
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


async def _fetch_map_reports(
    supabase: SupabaseClient,
    crisis_id: str,
    query: MapQuery,
) -> list[dict[str, Any]]:
    filters: list[tuple[str, str]] = [
        ("crisis_id", f"eq.{crisis_id}"),
        ("is_latest_version", "eq.true"),
    ]
    if query.damage_level:
        filters.append(("damage_level", f"eq.{query.damage_level}"))
    if query.infra_type:
        filters.append(("infra_type", f"eq.{query.infra_type}"))
    if query.status != "all":
        filters.append(("status", f"eq.{query.status}"))

    rows, _ = await supabase.select(
        "report",
        columns=(
            "id,location_id,damage_level,infra_type,status,"
            "location(id,latitude,longitude,geohash,report_count,admin_level_2)"
        ),
        filters=filters,
        limit=20_000,
    )

    if not query.bbox:
        return rows

    min_lng, min_lat, max_lng, max_lat = parse_bbox(query.bbox)
    filtered: list[dict[str, Any]] = []
    for row in rows:
        location = row.get("location") or {}
        lat = location.get("latitude")
        lng = location.get("longitude")
        if lat is None or lng is None:
            continue
        if min_lng <= lng <= max_lng and min_lat <= lat <= max_lat:
            filtered.append(row)
    return filtered


async def get_crisis_map(
    supabase: SupabaseClient, crisis_id: str, query: MapQuery
) -> MapFeatureCollection:
    await get_crisis(supabase, crisis_id)
    rows = await _fetch_map_reports(supabase, crisis_id, query)
    features: list[GeoJsonFeature] = []

    for row in rows:
        location = row.get("location") or {}
        lat = location.get("latitude")
        lng = location.get("longitude")
        if lat is None or lng is None:
            continue
        thumbnail = await latest_photo_thumbnail_for_location(
            supabase, location.get("id") or row["location_id"]
        )
        features.append(
            GeoJsonFeature(
                geometry={"type": "Point", "coordinates": [lng, lat]},
                properties={
                    "location_id": location.get("id") or row["location_id"],
                    "report_id": row["id"],
                    "damage_level": row["damage_level"],
                    "infra_type": row["infra_type"],
                    "report_count": location.get("report_count", 0),
                    "admin_level_2": location.get("admin_level_2"),
                    "latest_photo_thumbnail": thumbnail,
                },
            )
        )

    return MapFeatureCollection(features=features, total=len(features))


async def get_crisis_map_clusters(
    supabase: SupabaseClient, crisis_id: str, query: ClusterQuery
) -> MapFeatureCollection:
    await get_crisis(supabase, crisis_id)
    min_lng, min_lat, max_lng, max_lat = parse_bbox(query.bbox)
    map_query = MapQuery(bbox=query.bbox, status="all")
    rows = await _fetch_map_reports(supabase, crisis_id, map_query)

    clusters: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        location = row.get("location") or {}
        geohash = location.get("geohash")
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
