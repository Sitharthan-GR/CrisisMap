#!/usr/bin/env python3
"""Seed the API with diverse test reports for map, export, and admin testing.

Examples:
  # 30 reports around Knoxville on the first active crisis
  python scripts/seed_test_reports.py --count 30 --validate

  # Create 3 test crises + 20 reports each, with photos
  python scripts/seed_test_reports.py \\
    --admin-password "$ADMIN_PASSWORD" \\
    --crises 3 \\
    --count 20 \\
    --with-photos \\
    --validate

  # Stack version history at a few buildings
  python scripts/seed_test_reports.py --count 12 --versions-per-location 3
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

# Tiny solid-color PNGs (1x1) — green, orange, red for damage levels
_DAMAGE_PNG: dict[str, bytes] = {
    "minimal": base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    ),
    "partial": base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    ),
    "complete": base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    ),
}

DAMAGE_LEVELS = ["minimal", "partial", "complete"]
INFRA_TYPES = [
    "residential",
    "commercial",
    "government",
    "utility",
    "transport",
    "community",
    "public_space",
    "other",
]
NATURE_TYPES = [
    "earthquake",
    "flood",
    "tsunami",
    "cyclone",
    "wildfire",
    "explosion",
    "chemical",
    "conflict",
]

CRISIS_TEMPLATES = [
    ("Knoxville Flood 2026", "natural_hazard", "flood"),
    ("East TN Wildfire 2026", "natural_hazard", "wildfire"),
    ("Industrial Explosion 2026", "technological", "explosion"),
]

# Real-world crisis hotspots — (name, lat, lng, crisis_type, subtype, primary_nature)
WORLD_CRISIS_SITES = [
    ("Istanbul Earthquake 2026", 41.0082, 28.9784, "natural_hazard", "earthquake", "earthquake"),
    ("Kathmandu Earthquake 2026", 27.7172, 85.3240, "natural_hazard", "earthquake", "earthquake"),
    ("Tokyo Tsunami Warning 2026", 35.6762, 139.6503, "natural_hazard", "tsunami", "tsunami"),
    ("Manila Typhoon 2026", 14.5995, 120.9842, "natural_hazard", "cyclone", "cyclone"),
    ("Jakarta Floods 2026", -6.2088, 106.8456, "natural_hazard", "flood", "flood"),
    ("Port-au-Prince Earthquake 2026", 18.5944, -72.3074, "natural_hazard", "earthquake", "earthquake"),
    ("Kyiv Infrastructure Damage 2026", 50.4501, 30.5234, "human_made", "conflict", "conflict"),
    ("Aleppo Conflict Zone 2026", 36.2021, 37.1343, "human_made", "conflict", "conflict"),
    ("Los Angeles Wildfire 2026", 34.0522, -118.2437, "natural_hazard", "wildfire", "wildfire"),
    ("Houston Hurricane 2026", 29.7604, -95.3698, "natural_hazard", "cyclone", "cyclone"),
    ("Mexico City Earthquake 2026", 19.4326, -99.1332, "natural_hazard", "earthquake", "earthquake"),
    ("Christchurch Earthquake 2026", -43.5321, 172.6362, "natural_hazard", "earthquake", "earthquake"),
    ("Dhaka Monsoon Floods 2026", 23.8103, 90.4125, "natural_hazard", "flood", "flood"),
    ("Nairobi Flash Floods 2026", -1.2921, 36.8219, "natural_hazard", "flood", "flood"),
    ("Athens Wildfire 2026", 37.9838, 23.7275, "natural_hazard", "wildfire", "wildfire"),
    ("Beirut Port Explosion Aftermath 2026", 33.8938, 35.5018, "technological", "explosion", "explosion"),
    ("Chernobyl Zone Chemical Leak 2026", 51.2763, 30.2219, "technological", "chemical", "chemical"),
]

DEFAULT_CENTER = (35.9606, -83.9207)  # Knoxville, TN — matches frontend default


def _unwrap(body: dict[str, Any]) -> Any:
    if body.get("error"):
        raise RuntimeError(body["error"].get("message", "API error"))
    return body["data"]


def _api(client: httpx.Client, method: str, path: str, **kwargs: Any) -> Any:
    response = client.request(method, path, **kwargs)
    try:
        body = response.json()
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{method} {path} failed ({response.status_code})") from exc
    if response.status_code >= 400:
        message = body.get("error", {}).get("message", response.text)
        raise RuntimeError(f"{method} {path} failed ({response.status_code}): {message}")
    return _unwrap(body)


def admin_login(client: httpx.Client, password: str) -> str:
    data = _api(client, "POST", "/admin/login", json={"password": password})
    return data["token"]


def ensure_crises(
    client: httpx.Client,
    *,
    admin_token: str | None,
    crisis_count: int,
    center: tuple[float, float],
) -> list[dict[str, Any]]:
    if admin_token and crisis_count > 0:
        headers = {"Authorization": f"Bearer {admin_token}"}
        created: list[dict[str, Any]] = []
        onset = datetime.now(timezone.utc) - timedelta(days=2)
        for index in range(crisis_count):
            name, crisis_type, subtype = CRISIS_TEMPLATES[index % len(CRISIS_TEMPLATES)]
            lat = center[0] + random.uniform(-0.02, 0.02)
            lng = center[1] + random.uniform(-0.02, 0.02)
            crisis = _api(
                client,
                "POST",
                "/admin/crises",
                headers=headers,
                json={
                    "name": f"{name} (seed {index + 1})",
                    "crisis_type": crisis_type,
                    "crisis_subtype": subtype,
                    "onset_at": (onset + timedelta(hours=index)).isoformat(),
                    "epicenter_lat": lat,
                    "epicenter_lng": lng,
                },
            )
            created.append(crisis)
        return created

    crises = _api(client, "GET", "/crises", params={"status": "active"})
    if not crises:
        raise RuntimeError(
            "No active crisis found. Create one in Admin UI or pass --admin-password --crises 1"
        )
    return crises


def ensure_world_crises(
    client: httpx.Client,
    *,
    admin_token: str,
    site_count: int | None = None,
) -> list[dict[str, Any]]:
    headers = {"Authorization": f"Bearer {admin_token}"}
    sites = WORLD_CRISIS_SITES[: site_count or len(WORLD_CRISIS_SITES)]
    created: list[dict[str, Any]] = []
    onset = datetime.now(timezone.utc) - timedelta(days=14)
    for index, (name, lat, lng, crisis_type, subtype, _nature) in enumerate(sites):
        crisis = _api(
            client,
            "POST",
            "/admin/crises",
            headers=headers,
            json={
                "name": name,
                "crisis_type": crisis_type,
                "crisis_subtype": subtype,
                "onset_at": (onset + timedelta(days=index)).isoformat(),
                "epicenter_lat": lat,
                "epicenter_lng": lng,
            },
        )
        created.append(crisis)
    return created


def get_unlisted_crisis_id(client: httpx.Client) -> str:
    options = _api(client, "GET", "/crises/reporting-options")
    return options["unlisted_crisis_id"]


def world_report_plan(
    count: int,
    crises: list[dict[str, Any]],
    *,
    versions_per_location: int,
    unlisted_fraction: float,
    unlisted_crisis_id: str,
) -> list[dict[str, Any]]:
    """Build a report plan: crisis assignment, lat/lng, nature, and unlisted flag."""
    unlisted_count = max(1, round(count * unlisted_fraction)) if unlisted_fraction > 0 else 0
    listed_count = count - unlisted_count
    site_count = max(1, math.ceil(listed_count / max(1, versions_per_location)))

    # Pick crisis sites (cycle through created world crises)
    site_indices = list(range(min(site_count, len(crises))))
    while len(site_indices) < site_count:
        site_indices.append(len(site_indices) % len(crises))

    locations: list[tuple[str, float, float, str]] = []
    for site_idx in site_indices:
        crisis = crises[site_idx % len(crises)]
        crisis_id = crisis["id"]
        epicenter_lat = crisis.get("epicenter_lat") or WORLD_CRISIS_SITES[site_idx % len(WORLD_CRISIS_SITES)][1]
        epicenter_lng = crisis.get("epicenter_lng") or WORLD_CRISIS_SITES[site_idx % len(WORLD_CRISIS_SITES)][2]
        primary_nature = WORLD_CRISIS_SITES[site_idx % len(WORLD_CRISIS_SITES)][5]
        angle = random.uniform(0, 2 * math.pi)
        distance_km = random.uniform(0.3, 12.0)
        delta_lat = (distance_km / 111.0) * math.cos(angle)
        delta_lng = (distance_km / (111.0 * math.cos(math.radians(epicenter_lat)))) * math.sin(angle)
        base_lat = epicenter_lat + delta_lat
        base_lng = epicenter_lng + delta_lng
        locations.append((crisis_id, base_lat, base_lng, primary_nature))

    plan: list[dict[str, Any]] = []
    location_index = 0
    for i in range(listed_count):
        crisis_id, base_lat, base_lng, primary_nature = locations[location_index % len(locations)]
        jitter = 0.00005 * (i % versions_per_location)
        plan.append(
            {
                "crisis_id": crisis_id,
                "lat": base_lat + jitter,
                "lng": base_lng + jitter,
                "primary_nature": primary_nature,
                "is_unlisted": False,
            }
        )
        if (i + 1) % versions_per_location == 0:
            location_index += 1

    # Unlisted reports at random world locations (not tied to a listed crisis)
    for _ in range(unlisted_count):
        site = random.choice(WORLD_CRISIS_SITES)
        _name, lat, lng, _ctype, _subtype, primary_nature = site
        angle = random.uniform(0, 2 * math.pi)
        distance_km = random.uniform(1.0, 25.0)
        delta_lat = (distance_km / 111.0) * math.cos(angle)
        delta_lng = (distance_km / (111.0 * math.cos(math.radians(lat)))) * math.sin(angle)
        plan.append(
            {
                "crisis_id": unlisted_crisis_id,
                "lat": lat + delta_lat,
                "lng": lng + delta_lng,
                "primary_nature": primary_nature,
                "is_unlisted": True,
            }
        )

    random.shuffle(plan)
    return plan


def scatter_points(
    center: tuple[float, float],
    count: int,
    radius_km: float,
    versions_per_location: int,
) -> list[tuple[float, float]]:
    locations: list[tuple[float, float]] = []
    site_count = max(1, math.ceil(count / max(1, versions_per_location)))
    for _ in range(site_count):
        angle = random.uniform(0, 2 * math.pi)
        distance_km = random.uniform(0.2, radius_km)
        delta_lat = (distance_km / 111.0) * math.cos(angle)
        delta_lng = (distance_km / (111.0 * math.cos(math.radians(center[0])))) * math.sin(angle)
        locations.append((center[0] + delta_lat, center[1] + delta_lng))

    points: list[tuple[float, float]] = []
    location_index = 0
    for i in range(count):
        base = locations[location_index % len(locations)]
        # Slight jitter so version stacks stay within location matching tolerance
        jitter = 0.00005 * (i % versions_per_location)
        points.append((base[0] + jitter, base[1] + jitter))
        if (i + 1) % versions_per_location == 0:
            location_index += 1
    return points


def upload_photo(client: httpx.Client, report_id: str, damage_level: str) -> None:
    initiate = _api(
        client,
        "POST",
        f"/reports/{report_id}/photos/initiate",
        json={"mime_type": "image/png", "file_size_kb": 1},
    )
    image = _DAMAGE_PNG[damage_level]
    upload = client.put(
        initiate["upload_url"],
        content=image,
        headers={"Content-Type": "image/png"},
    )
    if upload.status_code >= 400:
        raise RuntimeError(f"Photo upload failed ({upload.status_code})")

    _api(
        client,
        "POST",
        f"/reports/{report_id}/photos/confirm",
        json={
            "photo_id": initiate["photo_id"],
            "storage_path": initiate["storage_path"],
            "file_size_kb": max(1, math.ceil(len(image) / 1024)),
            "mime_type": "image/png",
            "captured_at": datetime.now(timezone.utc).isoformat(),
        },
    )


def create_report(
    client: httpx.Client,
    *,
    crisis_id: str,
    lat: float,
    lng: float,
    damage_level: str,
    infra_type: str,
    nature: str,
    debris: bool,
    collected_at: datetime,
    index: int,
    is_unlisted: bool = False,
) -> dict[str, Any]:
    label = "Unlisted" if is_unlisted else "Listed"
    return _api(
        client,
        "POST",
        "/reports",
        json={
            "crisis_id": crisis_id,
            "damage_level": damage_level,
            "infra_type": infra_type,
            "infra_subtype": f"seed-{infra_type}",
            "infra_name": f"Seed building {index + 1}",
            "debris_present": debris,
            "nature_of_crisis": nature,
            "description_raw": (
                f"Synthetic {label} test report #{index + 1} — "
                f"{damage_level} {infra_type} / {nature} at {lat:.4f}, {lng:.4f}"
            ),
            "reporter_name": random.choice(["anonymous", "Test User A", "Test User B", "Field Observer"]),
            "source_language": random.choice(["en", "en", "es", "fr", "ar"]),
            "submission_channel": random.choice(["mobile", "mobile", "web"]),
            "collected_at": collected_at.isoformat(),
            "location": {
                "latitude": round(lat, 6),
                "longitude": round(lng, 6),
                "location_method": "manual",
            },
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed CrisisMap with test reports")
    parser.add_argument("--api-url", default="http://localhost:8000/api/v1")
    parser.add_argument("--count", type=int, default=25, help="Number of reports to create")
    parser.add_argument("--crises", type=int, default=0, help="Create N test crises (requires admin password)")
    parser.add_argument("--admin-password", default=None, help="Admin password for creating crises")
    parser.add_argument("--crisis-id", default=None, help="Use a specific crisis UUID")
    parser.add_argument("--center-lat", type=float, default=DEFAULT_CENTER[0])
    parser.add_argument("--center-lng", type=float, default=DEFAULT_CENTER[1])
    parser.add_argument("--radius-km", type=float, default=8.0, help="Spread reports within this radius")
    parser.add_argument("--versions-per-location", type=int, default=1, help="Reports stacked per building")
    parser.add_argument("--with-photos", action="store_true", help="Attach photos to ~70%% of reports")
    parser.add_argument(
        "--all-photos",
        action="store_true",
        help="Attach a photo to every report (overrides --with-photos probability)",
    )
    parser.add_argument("--validate", action="store_true", help="Set report status to validated (shows on map/export)")
    parser.add_argument(
        "--global",
        dest="global_mode",
        action="store_true",
        help="Seed reports at world crisis locations (requires --admin-password)",
    )
    parser.add_argument(
        "--reuse-crises",
        action="store_true",
        help="Use existing active crises instead of creating new world crises (global mode)",
    )
    parser.add_argument(
        "--unlisted-fraction",
        type=float,
        default=0.12,
        help="Fraction of reports submitted as unlisted (global mode, default 0.12)",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible data")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    random.seed(args.seed)
    center = (args.center_lat, args.center_lng)

    if args.global_mode and not args.admin_password:
        print("Error: --global requires --admin-password to create world crises.", file=sys.stderr)
        return 1

    print(f"API: {args.api_url}")
    if args.global_mode:
        print(
            f"Mode: global  |  Reports: {args.count}  |  "
            f"unlisted: {args.unlisted_fraction:.0%}  |  "
            f"versions/location: {args.versions_per_location}"
        )
    else:
        print(f"Reports: {args.count}  |  center: {center}  |  radius: {args.radius_km} km")
    if args.dry_run:
        print("Dry run — no requests will be sent.")
        if args.global_mode:
            for site in WORLD_CRISIS_SITES[:5]:
                print(f"  site: {site[0]} @ {site[1]:.4f}, {site[2]:.4f}")
        else:
            points = scatter_points(center, args.count, args.radius_km, args.versions_per_location)
            for i, (lat, lng) in enumerate(points[:5]):
                print(f"  sample {i + 1}: {lat:.5f}, {lng:.5f}")
        return 0

    with httpx.Client(base_url=args.api_url.rstrip("/"), timeout=120.0) as client:
        admin_token = None
        if args.admin_password:
            admin_token = admin_login(client, args.admin_password)
            print("Admin login OK")

        unlisted_crisis_id: str | None = None
        report_entries: list[dict[str, Any]]

        if args.global_mode:
            assert admin_token is not None
            if args.reuse_crises:
                crises = _api(client, "GET", "/crises", params={"status": "active"})
                if not crises:
                    raise RuntimeError("No active crises found. Run without --reuse-crises first.")
                print(f"Reusing {len(crises)} existing active crises")
            else:
                crises = ensure_world_crises(client, admin_token=admin_token)
                print(f"Created {len(crises)} world crises")
            crisis_ids = [c["id"] for c in crises]
            unlisted_crisis_id = get_unlisted_crisis_id(client)
            print(f"Unlisted crisis id: {unlisted_crisis_id}")
            report_entries = world_report_plan(
                args.count,
                crises,
                versions_per_location=args.versions_per_location,
                unlisted_fraction=args.unlisted_fraction,
                unlisted_crisis_id=unlisted_crisis_id,
            )
        elif args.crisis_id:
            crisis_ids = [args.crisis_id]
            points = scatter_points(center, args.count, args.radius_km, args.versions_per_location)
            report_entries = [
                {
                    "crisis_id": args.crisis_id,
                    "lat": lat,
                    "lng": lng,
                    "primary_nature": random.choice(NATURE_TYPES),
                    "is_unlisted": False,
                }
                for lat, lng in points
            ]
            crises = [{"id": args.crisis_id, "name": args.crisis_id}]
        else:
            crises = ensure_crises(
                client,
                admin_token=admin_token,
                crisis_count=args.crises,
                center=center,
            )
            crisis_ids = [c["id"] for c in crises]
            points = scatter_points(center, args.count, args.radius_km, args.versions_per_location)
            report_entries = [
                {
                    "crisis_id": crisis_ids[i % len(crisis_ids)],
                    "lat": lat,
                    "lng": lng,
                    "primary_nature": random.choice(NATURE_TYPES),
                    "is_unlisted": False,
                }
                for i, (lat, lng) in enumerate(points)
            ]

        print(f"Using {len(crisis_ids)} crisis(es): {[c.get('name', c['id']) for c in crises]}")

        created_ids: list[str] = []
        unlisted_ids: list[str] = []
        base_time = datetime.now(timezone.utc) - timedelta(days=30)
        damage_cycle = DAMAGE_LEVELS * (args.count // len(DAMAGE_LEVELS) + 1)

        for index, entry in enumerate(report_entries):
            damage = damage_cycle[index]
            infra = INFRA_TYPES[index % len(INFRA_TYPES)]
            # Mix primary site nature with random alternatives
            nature = entry["primary_nature"] if random.random() < 0.6 else random.choice(NATURE_TYPES)
            debris = random.choice([True, False])
            collected_at = base_time + timedelta(hours=index * 5, minutes=random.randint(0, 59))
            is_unlisted = entry.get("is_unlisted", False)

            report = create_report(
                client,
                crisis_id=entry["crisis_id"],
                lat=entry["lat"],
                lng=entry["lng"],
                damage_level=damage,
                infra_type=infra,
                nature=nature,
                debris=debris,
                collected_at=collected_at,
                index=index,
                is_unlisted=is_unlisted,
            )
            report_id = report["id"]
            created_ids.append(report_id)
            if is_unlisted:
                unlisted_ids.append(report_id)

            attach_photo = args.all_photos or (args.with_photos and random.random() < 0.7)
            if attach_photo:
                try:
                    upload_photo(client, report_id, damage)
                except RuntimeError as exc:
                    print(f"  warning: photo skipped for {report_id}: {exc}", file=sys.stderr)

            if args.validate and not is_unlisted:
                _api(
                    client,
                    "PATCH",
                    f"/reports/{report_id}/status",
                    json={"status": "validated"},
                )

            if (index + 1) % 10 == 0 or index + 1 == args.count:
                print(f"  created {index + 1}/{args.count} …")

        out_path = Path(__file__).resolve().parent / "seed_report_ids.json"
        out_path.write_text(
            json.dumps(
                {
                    "report_ids": created_ids,
                    "crisis_ids": crisis_ids,
                    "unlisted_report_ids": unlisted_ids,
                    "unlisted_crisis_id": unlisted_crisis_id,
                },
                indent=2,
            )
        )
        print(f"Done. {len(created_ids)} reports created ({len(unlisted_ids)} unlisted).")
        print(f"IDs saved to {out_path}")
        print("Open the dashboard map (status=all) or export validated reports from Admin.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
