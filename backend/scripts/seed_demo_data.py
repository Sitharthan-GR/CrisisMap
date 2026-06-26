#!/usr/bin/env python3
"""Wipe existing demo data and seed a curated dataset for presentations.

Creates exactly 6 listed crises (one closed), 3 unlisted reports, and ~27 total
reports with real disaster photos, version history at shared locations, and
coverage of all major app features.

Usage (from backend/, with API running):
  source .venv/bin/activate
  python scripts/seed_demo_data.py

Options:
  --api-url URL       API base (default http://localhost:8000/api/v1)
  --no-wipe           Skip deleting existing crises/reports
  --fetch-images      Re-download photos from Wikimedia Commons
  --dry-run           Print plan without API calls
"""

from __future__ import annotations

import argparse
import json
import math
import mimetypes
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ASSETS_DIR = SCRIPT_DIR / "demo_assets"
IMAGES_DIR = ASSETS_DIR / "images"
MANIFEST_PATH = ASSETS_DIR / "manifest.json"

sys.path.insert(0, str(BACKEND_DIR))
from app.config import get_settings  # noqa: E402

WIKIMEDIA_USER_AGENT = "CrisisMap-Demo-Seed/1.0 (demo@crisismap.local)"

# ~1.1 m per step at mid-latitudes — keeps stacks within the 5 m match tolerance.
VERSION_JITTER = 0.00001

FLOOD_FORM_TEMPLATE = {
    "name": "Flood Impact Assessment",
    "title": "Flood Damage Assessment",
    "intro": "Document standing water, evacuation status, and access conditions at this site.",
    "fields": [
        {
            "id": "water_depth",
            "label": "Estimated water depth",
            "type": "select",
            "required": True,
            "options": ["Ankle (<30 cm)", "Knee (30-60 cm)", "Waist (60-120 cm)", "Over 2 m"],
        },
        {
            "id": "evacuation_status",
            "label": "Evacuation status",
            "type": "radio",
            "required": True,
            "options": ["Residents still inside", "Partially evacuated", "Fully evacuated"],
        },
        {
            "id": "access_notes",
            "label": "Road / access conditions",
            "type": "textarea",
            "required": False,
        },
        {
            "id": "pumps_needed",
            "label": "Pumping equipment needed",
            "type": "checkbox",
            "required": False,
            "options": ["Pumping equipment needed"],
        },
        {
            "id": "affected_count",
            "label": "Estimated people affected",
            "type": "number",
            "required": False,
        },
    ],
}

# Each crisis: metadata + list of report specs.
# location_group: reports with the same key stack as versions at one building.
DEMO_CRISSES: list[dict[str, Any]] = [
    {
        "key": "istanbul_earthquake",
        "name": "Istanbul Earthquake 2026",
        "crisis_type": "natural_hazard",
        "crisis_subtype": "earthquake",
        "epicenter_lat": 41.0082,
        "epicenter_lng": 28.9784,
        "onset_days_ago": 21,
        "status": "active",
        "reports": [
            {
                "location_group": "karakoy_apartment",
                "lat": 41.0258,
                "lng": 28.9744,
                "version_index": 0,
                "damage_level": "minimal",
                "infra_type": "residential",
                "infra_name": "Karaköy Apartment Block — 14 Hüdavendigar Cd.",
                "debris_present": False,
                "nature_of_crisis": "earthquake",
                "description": (
                    "Day 1 after the quake: hairline cracks along the east facade and "
                    "dislodged balcony railings. Residents remain inside; structure appears "
                    "standing but engineers have not inspected yet."
                ),
                "reporter_name": "Ayşe Demir",
                "source_language": "tr",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 20,
                "photo": "earthquake_v1_cracks.jpg",
            },
            {
                "location_group": "karakoy_apartment",
                "lat": 41.0258,
                "lng": 28.9744,
                "version_index": 1,
                "damage_level": "partial",
                "infra_type": "residential",
                "infra_name": "Karaköy Apartment Block — 14 Hüdavendigar Cd.",
                "debris_present": True,
                "nature_of_crisis": "earthquake",
                "description": (
                    "Day 5: upper floors show visible structural damage. Corner columns "
                    "exposed; windows blown out on floors 4–6. Building evacuated after "
                    "aftershock. Debris scattered on street."
                ),
                "reporter_name": "Mehmet Yılmaz",
                "source_language": "tr",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 16,
                "photo": "earthquake_v2_structural.jpg",
            },
            {
                "location_group": "karakoy_apartment",
                "lat": 41.0258,
                "lng": 28.9744,
                "version_index": 2,
                "damage_level": "complete",
                "infra_type": "residential",
                "infra_name": "Karaköy Apartment Block — 14 Hüdavendigar Cd.",
                "debris_present": True,
                "nature_of_crisis": "earthquake",
                "description": (
                    "Day 12: eastern wing partially collapsed. Rescue teams searching "
                    "rubble. Building marked for demolition. Clear progression from "
                    "minor cracks to structural failure."
                ),
                "reporter_name": "UN OCHA Field Team",
                "source_language": "en",
                "submission_channel": "web",
                "status": "validated",
                "collected_days_ago": 9,
                "photo": "earthquake_v3_collapsed.jpg",
            },
            {
                "lat": 41.0086,
                "lng": 28.9802,
                "damage_level": "partial",
                "infra_type": "government",
                "infra_name": "District Municipal Office — Sultanahmet",
                "debris_present": True,
                "nature_of_crisis": "earthquake",
                "description": (
                    "Municipal office facade cracked; administrative records being "
                    "salvaged. Awaiting structural assessment before staff return."
                ),
                "reporter_name": "anonymous",
                "source_language": "en",
                "submission_channel": "web",
                "status": "pending",
                "collected_days_ago": 14,
                "photo": "earthquake_govt_building.jpg",
            },
            {
                "lat": 41.0450,
                "lng": 29.0340,
                "damage_level": "partial",
                "infra_type": "transport",
                "infra_name": "Bosphorus Bridge Approach Ramp",
                "debris_present": False,
                "nature_of_crisis": "earthquake",
                "description": (
                    "Approach ramp shows pavement uplift and guardrail damage. Bridge "
                    "closed to heavy vehicles pending inspection."
                ),
                "reporter_name": "Transport Authority",
                "source_language": "en",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 18,
                "photo": "earthquake_bridge.jpg",
            },
        ],
    },
    {
        "key": "jakarta_floods",
        "name": "Jakarta Monsoon Floods 2026",
        "crisis_type": "natural_hazard",
        "crisis_subtype": "flood",
        "epicenter_lat": -6.2088,
        "epicenter_lng": 106.8456,
        "onset_days_ago": 10,
        "status": "active",
        "custom_form": True,
        "reports": [
            {
                "location_group": "kampung_house",
                "lat": -6.1751,
                "lng": 106.8272,
                "version_index": 0,
                "damage_level": "minimal",
                "infra_type": "residential",
                "infra_name": "Kampung Melayu Row House #12",
                "debris_present": False,
                "nature_of_crisis": "flood",
                "description": (
                    "Standing water ankle-deep in ground-floor rooms. Families moving "
                    "belongings to upper floor. Pumping not yet available."
                ),
                "reporter_name": "Budi Santoso",
                "source_language": "id",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 9,
                "photo": "flood_v1_ankle.jpg",
                "form_responses": {
                    "water_depth": "Ankle (<30 cm)",
                    "evacuation_status": "Residents still inside",
                    "access_notes": "Street passable by foot only",
                    "pumps_needed": ["Pumping equipment needed"],
                    "affected_count": 6,
                },
            },
            {
                "location_group": "kampung_house",
                "lat": -6.1751,
                "lng": 106.8272,
                "version_index": 1,
                "damage_level": "partial",
                "infra_type": "residential",
                "infra_name": "Kampung Melayu Row House #12",
                "debris_present": True,
                "nature_of_crisis": "flood",
                "description": (
                    "Water now knee-deep; furniture floating. Electrical supply cut. "
                    "Families sheltering on roof. Same building as earlier report — "
                    "conditions worsening."
                ),
                "reporter_name": "Budi Santoso",
                "source_language": "id",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 7,
                "photo": "flood_v2_knee.jpg",
                "form_responses": {
                    "water_depth": "Knee (30-60 cm)",
                    "evacuation_status": "Partially evacuated",
                    "access_notes": "Road submerged 200 m north",
                    "pumps_needed": ["Pumping equipment needed"],
                    "affected_count": 6,
                },
            },
            {
                "location_group": "kampung_house",
                "lat": -6.1751,
                "lng": 106.8272,
                "version_index": 2,
                "damage_level": "complete",
                "infra_type": "residential",
                "infra_name": "Kampung Melayu Row House #12",
                "debris_present": True,
                "nature_of_crisis": "flood",
                "description": (
                    "Ground floor fully submerged past windows. Structure compromised — "
                    "walls bowing inward. All residents evacuated to shelter."
                ),
                "reporter_name": "Red Cross Volunteer",
                "source_language": "en",
                "submission_channel": "web",
                "status": "validated",
                "collected_days_ago": 4,
                "photo": "flood_v3_submerged.jpg",
                "form_responses": {
                    "water_depth": "Over 2 m",
                    "evacuation_status": "Fully evacuated",
                    "access_notes": "Boat access only",
                    "pumps_needed": ["Pumping equipment needed"],
                    "affected_count": 6,
                },
            },
            {
                "lat": -6.2145,
                "lng": 106.8520,
                "damage_level": "partial",
                "infra_type": "utility",
                "infra_name": "Ciliwung Substation",
                "debris_present": False,
                "nature_of_crisis": "flood",
                "description": (
                    "Floodwater reached transformer yard. Power cut to 3,200 households. "
                    "Crew waiting for water to recede before repairs."
                ),
                "reporter_name": "PLN Inspector",
                "source_language": "id",
                "submission_channel": "web",
                "status": "rejected",
                "collected_days_ago": 6,
                "photo": "flood_utility.jpg",
                "form_responses": {
                    "water_depth": "Waist (60-120 cm)",
                    "evacuation_status": "Fully evacuated",
                    "access_notes": "Substation fenced off",
                },
            },
        ],
    },
    {
        "key": "la_wildfire",
        "name": "Los Angeles Wildfire 2026",
        "crisis_type": "natural_hazard",
        "crisis_subtype": "wildfire",
        "epicenter_lat": 34.0522,
        "epicenter_lng": -118.2437,
        "onset_days_ago": 14,
        "status": "active",
        "reports": [
            {
                "lat": 34.0456,
                "lng": -118.5183,
                "damage_level": "complete",
                "infra_type": "residential",
                "infra_name": "Pacific Palisades Home — El Medio Ave",
                "debris_present": True,
                "nature_of_crisis": "wildfire",
                "description": (
                    "Single-family home reduced to ash and chimney stack. Only concrete "
                    "foundation remains. Neighboring lots similarly destroyed."
                ),
                "reporter_name": "LA County Assessor",
                "source_language": "en",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 12,
                "photo": "wildfire_complete.jpg",
            },
            {
                "lat": 34.0512,
                "lng": -118.5098,
                "damage_level": "partial",
                "infra_type": "residential",
                "infra_name": "Palisades Duplex — Sunset Blvd",
                "debris_present": True,
                "nature_of_crisis": "wildfire",
                "description": (
                    "Roof and attic burned through; ground floor walls standing but "
                    "smoke-damaged. Fence line fire stopped at property edge."
                ),
                "reporter_name": "Neighbor Report",
                "source_language": "en",
                "submission_channel": "web",
                "status": "validated",
                "collected_days_ago": 11,
                "photo": "wildfire_partial.jpg",
            },
            {
                "lat": 34.0389,
                "lng": -118.4956,
                "damage_level": "minimal",
                "infra_type": "public_space",
                "infra_name": "Palisades Park Trailhead",
                "debris_present": False,
                "nature_of_crisis": "wildfire",
                "description": (
                    "Scorched brush within 50 m of trail; picnic structures intact. "
                    "Park closed as precaution."
                ),
                "reporter_name": "Park Ranger",
                "source_language": "en",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 13,
                "photo": "wildfire_minimal.jpg",
            },
            {
                "lat": 34.0623,
                "lng": -118.4871,
                "damage_level": "complete",
                "infra_type": "commercial",
                "infra_name": "Palisades Village Retail Strip",
                "debris_present": True,
                "nature_of_crisis": "wildfire",
                "description": (
                    "Three storefronts destroyed; inventory and signage melted. "
                    "Business owners gathering insurance documentation."
                ),
                "reporter_name": "Chamber of Commerce",
                "source_language": "en",
                "submission_channel": "web",
                "status": "validated",
                "collected_days_ago": 10,
                "photo": "wildfire_commercial.jpg",
            },
        ],
    },
    {
        "key": "beirut_explosion",
        "name": "Beirut Port Explosion 2026",
        "crisis_type": "technological",
        "crisis_subtype": "explosion",
        "epicenter_lat": 33.8938,
        "epicenter_lng": 35.5018,
        "onset_days_ago": 18,
        "status": "active",
        "reports": [
            {
                "lat": 33.9014,
                "lng": 35.5185,
                "damage_level": "complete",
                "infra_type": "commercial",
                "infra_name": "Port Warehouse District — Hangar 12",
                "debris_present": True,
                "nature_of_crisis": "explosion",
                "description": (
                    "Warehouse facade blown outward; steel framing twisted. Glass and "
                    "debris across 400 m radius. Area cordoned off."
                ),
                "reporter_name": "Port Authority",
                "source_language": "ar",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 17,
                "photo": "explosion_commercial.jpg",
            },
            {
                "lat": 33.8967,
                "lng": 35.5052,
                "damage_level": "partial",
                "infra_type": "government",
                "infra_name": "Customs Administration Building",
                "debris_present": True,
                "nature_of_crisis": "explosion",
                "description": (
                    "Blast wave shattered all windows; interior walls cracked. Records "
                    "recovery underway. Staff relocated to temporary offices."
                ),
                "reporter_name": "Customs Officer",
                "source_language": "ar",
                "submission_channel": "web",
                "status": "validated",
                "collected_days_ago": 16,
                "photo": "explosion_government.jpg",
            },
            {
                "lat": 33.8891,
                "lng": 35.5123,
                "damage_level": "minimal",
                "infra_type": "utility",
                "infra_name": "Port Electrical Switchyard",
                "debris_present": False,
                "nature_of_crisis": "explosion",
                "description": (
                    "Minor blast damage to perimeter fencing; main switchgear operational. "
                    "Monitoring for secondary hazards."
                ),
                "reporter_name": "anonymous",
                "source_language": "en",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 17,
            },
            {
                "lat": 33.8945,
                "lng": 35.4987,
                "damage_level": "partial",
                "infra_type": "other",
                "infra_subtype": "grain silo",
                "infra_name": "Port Grain Silo Complex",
                "debris_present": True,
                "nature_of_crisis": "explosion",
                "description": (
                    "Silo structure leaning; grain spillage on quay. Demolition being "
                    "planned to prevent collapse onto active berths."
                ),
                "reporter_name": "Harbor Master",
                "source_language": "fr",
                "submission_channel": "web",
                "status": "validated",
                "collected_days_ago": 15,
                "photo": "explosion_utility.jpg",
            },
        ],
    },
    {
        "key": "kyiv_conflict",
        "name": "Kyiv Infrastructure Damage 2026",
        "crisis_type": "human_made",
        "crisis_subtype": "conflict",
        "epicenter_lat": 50.4501,
        "epicenter_lng": 30.5234,
        "onset_days_ago": 45,
        "status": "active",
        "reports": [
            {
                "lat": 50.4501,
                "lng": 30.5234,
                "damage_level": "complete",
                "infra_type": "government",
                "infra_name": "Regional Administration Building",
                "debris_present": True,
                "nature_of_crisis": "conflict",
                "description": (
                    "Direct hit destroyed north wing. Emergency services operating from "
                    "basement shelter. Structural engineers assessing salvage options."
                ),
                "reporter_name": "Municipal Observer",
                "source_language": "uk",
                "submission_channel": "web",
                "status": "validated",
                "collected_days_ago": 40,
                "photo": "conflict_government.jpg",
            },
            {
                "lat": 50.4623,
                "lng": 30.5145,
                "damage_level": "partial",
                "infra_type": "residential",
                "infra_name": "Pechersk Apartment Block",
                "debris_present": True,
                "nature_of_crisis": "conflict",
                "description": (
                    "Artillery damage to upper floors; shrapnel scars on facade. "
                    "Residents in ground-floor units; upper floors abandoned."
                ),
                "reporter_name": "Local Resident",
                "source_language": "uk",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 38,
                "photo": "conflict_residential.jpg",
            },
            {
                "lat": 50.4389,
                "lng": 30.5456,
                "damage_level": "minimal",
                "infra_type": "transport",
                "infra_name": "Darnytsia Rail Overpass",
                "debris_present": False,
                "nature_of_crisis": "conflict",
                "description": (
                    "Near-miss left blast marks on abutment; bridge remains passable "
                    "at reduced speed. Inspection scheduled."
                ),
                "reporter_name": "Railway Inspector",
                "source_language": "en",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 35,
                "photo": "conflict_transport.jpg",
            },
            {
                "lat": 50.4712,
                "lng": 30.4987,
                "damage_level": "partial",
                "infra_type": "utility",
                "infra_name": "Substation — Obolon District",
                "debris_present": False,
                "nature_of_crisis": "conflict",
                "description": (
                    "Transformer yard hit; rolling blackouts in effect. Repair crew "
                    "awaiting security clearance."
                ),
                "reporter_name": "anonymous",
                "source_language": "en",
                "submission_channel": "web",
                "status": "pending",
                "collected_days_ago": 30,
            },
        ],
    },
    {
        "key": "east_tn_flood",
        "name": "East Tennessee Flood 2025",
        "crisis_type": "natural_hazard",
        "crisis_subtype": "flood",
        "epicenter_lat": 35.9606,
        "epicenter_lng": -83.9207,
        "onset_days_ago": 180,
        "status": "closed",
        "reports": [
            {
                "lat": 35.9645,
                "lng": -83.9156,
                "damage_level": "partial",
                "infra_type": "residential",
                "infra_name": "Fort Sanders Historic Home",
                "debris_present": False,
                "nature_of_crisis": "flood",
                "description": (
                    "French Broad overflow flooded basement and ground floor. Mold "
                    "remediation completed; family returned upstairs."
                ),
                "reporter_name": "Knoxville EMA",
                "source_language": "en",
                "submission_channel": "web",
                "status": "validated",
                "collected_days_ago": 175,
                "photo": "tn_flood_residential.jpg",
            },
            {
                "lat": 35.9589,
                "lng": -83.9289,
                "damage_level": "minimal",
                "infra_type": "commercial",
                "infra_name": "Market Square Shopfront",
                "debris_present": False,
                "nature_of_crisis": "flood",
                "description": (
                    "Water reached threshold but did not enter shop. Sandbags effective. "
                    "Business reopened within 48 hours."
                ),
                "reporter_name": "Shop Owner",
                "source_language": "en",
                "submission_channel": "mobile",
                "status": "validated",
                "collected_days_ago": 174,
            },
            {
                "lat": 35.9523,
                "lng": -83.9012,
                "damage_level": "complete",
                "infra_type": "transport",
                "infra_name": "James White Parkway Underpass",
                "debris_present": True,
                "nature_of_crisis": "flood",
                "description": (
                    "Underpass fully inundated; pavement washed out. Route closed for "
                    "six weeks during reconstruction."
                ),
                "reporter_name": "TDOT Inspector",
                "source_language": "en",
                "submission_channel": "web",
                "status": "validated",
                "collected_days_ago": 172,
                "photo": "flood_transport.jpg",
            },
        ],
    },
]

UNLISTED_REPORTS: list[dict[str, Any]] = [
    {
        "lat": 38.9637,
        "lng": 35.2433,
        "damage_level": "partial",
        "infra_type": "residential",
        "infra_name": "Rural Home — Cappadocia Region",
        "debris_present": True,
        "nature_of_crisis": "earthquake",
        "description": (
            "Unlisted report: moderate earthquake damage to stone house. Not yet "
            "linked to any active crisis — candidate for assignment to Istanbul event."
        ),
        "reporter_name": "Village Head",
        "source_language": "tr",
        "submission_channel": "mobile",
        "status": "pending",
        "collected_days_ago": 5,
        "photo": "unlisted_earthquake.jpg",
    },
    {
        "lat": 34.4367,
        "lng": 35.8497,
        "damage_level": "complete",
        "infra_type": "commercial",
        "infra_name": "Coastal Warehouse — Tripoli",
        "debris_present": True,
        "nature_of_crisis": "explosion",
        "description": (
            "Unlisted report: warehouse destroyed by blast. Could be used to demo "
            "'create new crisis from unlisted report' in admin."
        ),
        "reporter_name": "Harbor Worker",
        "source_language": "ar",
        "submission_channel": "web",
        "status": "pending",
        "collected_days_ago": 3,
        "photo": "unlisted_explosion.jpg",
    },
    {
        "lat": 48.8566,
        "lng": 2.3522,
        "damage_level": "minimal",
        "infra_type": "other",
        "infra_subtype": "chemical plant",
        "infra_name": "Industrial Zone — Seine Corridor",
        "debris_present": False,
        "nature_of_crisis": "chemical",
        "description": (
            "Unlisted report: chemical odor reported near storage tanks. No visible "
            "damage; monitoring only. Demo for chemical nature icon and dismiss flow."
        ),
        "reporter_name": "anonymous",
        "source_language": "fr",
        "submission_channel": "mobile",
        "status": "pending",
        "collected_days_ago": 1,
    },
]


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


def _read_env_value(name: str) -> str | None:
    value = os.environ.get(name)
    if value:
        return value.strip().strip('"').strip("'")
    env_path = BACKEND_DIR / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text().splitlines():
        if line.strip().startswith("#") or "=" not in line:
            continue
        key, raw = line.split("=", 1)
        if key.strip() == name:
            return raw.strip().strip('"').strip("'")
    return None


def _supabase_project_ref(supabase_url: str) -> str:
    host = supabase_url.replace("https://", "").replace("http://", "").split("/")[0]
    return host.split(".")[0]


def apply_migration_007(settings: Any) -> None:
    """Apply submission_channel migration when SUPABASE_DB_PASSWORD is configured."""
    migration_path = BACKEND_DIR / "migrations" / "007_submission_channel.sql"
    if not migration_path.exists():
        return

    password = _read_env_value("SUPABASE_DB_PASSWORD") or _read_env_value("DATABASE_PASSWORD")
    if not password:
        print(
            "Tip: add SUPABASE_DB_PASSWORD to backend/.env to auto-apply migration 007, "
            "or run backend/migrations/007_submission_channel.sql in the Supabase SQL editor."
        )
        return

    try:
        import psycopg
    except ImportError:
        print(
            "Install psycopg to auto-apply migrations: pip install 'psycopg[binary]'"
        )
        return

    ref = _supabase_project_ref(settings.supabase_url)
    conninfo = (
        f"postgresql://postgres:{password}@db.{ref}.supabase.co:5432/postgres"
        f"?sslmode=require"
    )
    sql = migration_path.read_text()
    statements = [s.strip() for s in re.split(r";\s*\n", sql) if s.strip() and not s.strip().startswith("--")]

    print("Applying migration 007 (submission_channel)…")
    with psycopg.connect(conninfo, connect_timeout=20) as conn:
        with conn.cursor() as cur:
            for statement in statements:
                cur.execute(statement)
        conn.commit()
    print("  migration 007 applied.")


def verify_submission_channels(
    client: httpx.Client,
    unlisted_crisis_id: str,
    *,
    admin_token: str | None = None,
) -> None:
    """Fail fast when migration 007 has not been applied to Supabase."""
    probe = {
        "crisis_id": unlisted_crisis_id,
        "damage_level": "minimal",
        "infra_type": "other",
        "debris_present": False,
        "submission_channel": "mobile",
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "location": {
            "latitude": 0.0001,
            "longitude": 0.0001,
            "location_method": "manual",
        },
    }
    response = client.post("/reports", json=probe)
    if response.status_code < 400:
        report_id = response.json()["data"]["id"]
        if admin_token:
            client.delete(
                f"/admin/reports/{report_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        return

    message = response.json().get("error", {}).get("message", response.text)
    if "submission_channel" in message:
        raise RuntimeError(
            "Database still expects legacy submission_channel values. "
            "Run backend/migrations/007_submission_channel.sql in the Supabase SQL editor, "
            "or set SUPABASE_DB_PASSWORD in backend/.env and install psycopg."
        )
    raise RuntimeError(f"Preflight report probe failed: {message}")


def _supabase_headers(service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }


AD_HOC_DEMO_CRISIS_NAMES = frozenset({
    "East Tennessee Storm 2026",
    "Demo Coastal Storm 2026",
})


def delete_ad_hoc_demo_crises(client: httpx.Client, settings: Any) -> None:
    """Remove ad-hoc crises created by older demo recording scripts."""
    service_key = settings.supabase_service_role_key.get_secret_value()
    rest = settings.supabase_rest_url
    bucket = settings.supabase_storage_bucket
    storage_base = f"{settings.supabase_url}/storage/v1"
    headers = _supabase_headers(service_key)
    minimal_headers = {**headers, "Prefer": "return=minimal"}

    crisis_resp = client.get(
        f"{rest}/crisis",
        params={"select": "id,name,is_unlisted", "is_unlisted": "eq.false"},
        headers=headers,
    )
    if crisis_resp.status_code >= 400:
        return

    targets = [
        crisis for crisis in crisis_resp.json() if crisis.get("name") in AD_HOC_DEMO_CRISIS_NAMES
    ]
    if not targets:
        return

    print(f"Removing {len(targets)} ad-hoc demo crisis(es)…")
    target_ids = [crisis["id"] for crisis in targets]

    for crisis_id in target_ids:
        report_resp = client.get(
            f"{rest}/report",
            params={"select": "id", "crisis_id": f"eq.{crisis_id}"},
            headers=headers,
        )
        if report_resp.status_code >= 400:
            continue
        report_ids = [row["id"] for row in report_resp.json()]
        if not report_ids:
            continue

        photo_resp = client.get(
            f"{rest}/photo",
            params={"select": "id,storage_url", "report_id": f"in.({','.join(report_ids)})"},
            headers=headers,
        )
        if photo_resp.status_code < 400:
            for photo in photo_resp.json():
                path = photo.get("storage_url")
                if path:
                    client.delete(f"{storage_base}/object/{bucket}/{path}", headers=headers)
            client.delete(
                f"{rest}/photo",
                params={"report_id": f"in.({','.join(report_ids)})"},
                headers=minimal_headers,
            )

        client.delete(
            f"{rest}/report",
            params={"crisis_id": f"eq.{crisis_id}"},
            headers=minimal_headers,
        )

    for crisis in targets:
        client.delete(f"{rest}/crisis", params={"id": f"eq.{crisis['id']}"}, headers=minimal_headers)
        print(f"  deleted crisis: {crisis['name']}")


def wipe_demo_data(client: httpx.Client, settings: Any) -> None:
    """Remove all reports, locations, photos, and listed crises. Keeps unlisted crisis row."""
    service_key = settings.supabase_service_role_key.get_secret_value()
    rest = settings.supabase_rest_url
    bucket = settings.supabase_storage_bucket
    storage_base = f"{settings.supabase_url}/storage/v1"
    headers = _supabase_headers(service_key)
    minimal_headers = {**headers, "Prefer": "return=minimal"}

    print("Wiping existing data…")

    # Photos + storage
    photo_resp = client.get(
        f"{rest}/photo",
        params={"select": "id,storage_url"},
        headers=headers,
    )
    if photo_resp.status_code < 400:
        photos = photo_resp.json()
        for photo in photos:
            path = photo.get("storage_url")
            if path:
                client.delete(f"{storage_base}/object/{bucket}/{path}", headers=headers)
        if photos:
            client.delete(f"{rest}/photo", params={"id": "neq.00000000-0000-0000-0000-000000000000"}, headers=minimal_headers)
            print(f"  deleted {len(photos)} photo(s)")

    # Reports
    report_resp = client.get(f"{rest}/report", params={"select": "id"}, headers=headers)
    if report_resp.status_code < 400:
        reports = report_resp.json()
        if reports:
            client.delete(
                f"{rest}/report",
                params={"id": "neq.00000000-0000-0000-0000-000000000000"},
                headers=minimal_headers,
            )
            print(f"  deleted {len(reports)} report(s)")

    # Locations
    loc_resp = client.get(f"{rest}/location", params={"select": "id"}, headers=headers)
    if loc_resp.status_code < 400:
        locations = loc_resp.json()
        if locations:
            client.delete(
                f"{rest}/location",
                params={"id": "neq.00000000-0000-0000-0000-000000000000"},
                headers=minimal_headers,
            )
            print(f"  deleted {len(locations)} location(s)")

    # Listed crises only
    crisis_resp = client.get(
        f"{rest}/crisis",
        params={"select": "id,name,is_unlisted", "is_unlisted": "eq.false"},
        headers=headers,
    )
    if crisis_resp.status_code < 400:
        crises = crisis_resp.json()
        for crisis in crises:
            client.delete(f"{rest}/crisis", params={"id": f"eq.{crisis['id']}"}, headers=minimal_headers)
        if crises:
            print(f"  deleted {len(crises)} listed crisis(es)")

    # Custom form templates (re-created on seed)
    tmpl_resp = client.get(f"{rest}/form_template", params={"select": "id,name"}, headers=headers)
    if tmpl_resp.status_code < 400:
        templates = tmpl_resp.json()
        for tmpl in templates:
            client.delete(f"{rest}/form_template", params={"id": f"eq.{tmpl['id']}"}, headers=minimal_headers)
        if templates:
            print(f"  deleted {len(templates)} form template(s)")

    print("Wipe complete.")


def load_manifest() -> dict[str, dict[str, str]]:
    return json.loads(MANIFEST_PATH.read_text())


def ensure_images(manifest: dict[str, dict[str, str]], *, force: bool = False) -> dict[str, Path]:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    headers = {"User-Agent": WIKIMEDIA_USER_AGENT}

    with httpx.Client(timeout=120.0, follow_redirects=True) as dl:
        for filename, meta in manifest.items():
            dest = IMAGES_DIR / filename
            paths[filename] = dest
            if dest.exists() and not force:
                continue
            print(f"  downloading {filename}…")
            for attempt in range(5):
                response = dl.get(meta["url"], headers=headers)
                if response.status_code == 429:
                    wait = 3 * (attempt + 1)
                    print(f"    rate limited — waiting {wait}s…")
                    time.sleep(wait)
                    continue
                response.raise_for_status()
                dest.write_bytes(response.content)
                break
            else:
                raise RuntimeError(f"Failed to download {filename} after retries")
            time.sleep(1.5)
    return paths


def detect_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    if mime in ("image/jpeg", "image/png", "image/webp"):
        return mime
    if path.suffix.lower() in (".jpg", ".jpeg"):
        return "image/jpeg"
    if path.suffix.lower() == ".png":
        return "image/png"
    return "image/jpeg"


def admin_login(client: httpx.Client, password: str) -> str:
    return _api(client, "POST", "/admin/login", json={"password": password})["token"]


def apply_jitter(lat: float, lng: float, version_index: int | None) -> tuple[float, float]:
    if version_index is None:
        return lat, lng
    jitter = VERSION_JITTER * version_index
    return lat + jitter, lng + jitter


def upload_photo(
    client: httpx.Client,
    report_id: str,
    image_path: Path,
    collected_at: datetime,
) -> None:
    mime = detect_mime(image_path)
    image_bytes = image_path.read_bytes()
    size_kb = max(1, math.ceil(len(image_bytes) / 1024))

    initiate = _api(
        client,
        "POST",
        f"/reports/{report_id}/photos/initiate",
        json={"mime_type": mime, "file_size_kb": size_kb},
    )

    last_error: Exception | None = None
    for attempt in range(4):
        try:
            upload = client.put(
                initiate["upload_url"],
                content=image_bytes,
                headers={"Content-Type": mime},
                timeout=120.0,
            )
            if upload.status_code >= 400:
                raise RuntimeError(f"Photo upload failed ({upload.status_code})")
            last_error = None
            break
        except (httpx.ReadError, httpx.ConnectError, httpx.TimeoutException) as exc:
            last_error = exc
            wait = 2 * (attempt + 1)
            print(f"    photo upload retry in {wait}s ({exc})…", file=sys.stderr)
            time.sleep(wait)
    if last_error:
        raise RuntimeError(f"Photo upload failed after retries: {last_error}") from last_error

    _api(
        client,
        "POST",
        f"/reports/{report_id}/photos/confirm",
        json={
            "photo_id": initiate["photo_id"],
            "storage_path": initiate["storage_path"],
            "file_size_kb": size_kb,
            "mime_type": mime,
            "captured_at": collected_at.isoformat(),
        },
    )


def create_report(
    client: httpx.Client,
    *,
    crisis_id: str,
    spec: dict[str, Any],
    collected_at: datetime,
) -> dict[str, Any]:
    lat, lng = apply_jitter(spec["lat"], spec["lng"], spec.get("version_index"))
    payload: dict[str, Any] = {
        "crisis_id": crisis_id,
        "damage_level": spec["damage_level"],
        "infra_type": spec["infra_type"],
        "infra_subtype": spec.get("infra_subtype"),
        "infra_name": spec["infra_name"],
        "debris_present": spec["debris_present"],
        "nature_of_crisis": spec["nature_of_crisis"],
        "description_raw": spec["description"],
        "reporter_name": spec.get("reporter_name", "anonymous"),
        "source_language": spec.get("source_language", "en"),
        "submission_channel": spec.get("submission_channel", "web"),
        "collected_at": collected_at.isoformat(),
        "location": {
            "latitude": round(lat, 6),
            "longitude": round(lng, 6),
            "location_method": "manual",
        },
    }
    if spec.get("form_responses"):
        payload["form_responses"] = spec["form_responses"]
    return _api(client, "POST", "/reports", json=payload)


def set_report_status(client: httpx.Client, report_id: str, status: str) -> None:
    if status == "pending":
        return
    _api(client, "PATCH", f"/reports/{report_id}/status", json={"status": status})


def seed_demo(
    client: httpx.Client,
    *,
    admin_token: str,
    image_paths: dict[str, Path],
    now: datetime,
) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {admin_token}"}
    result: dict[str, Any] = {"crises": [], "reports": [], "unlisted_reports": []}

    form_template_id: str | None = None
    if any(c.get("custom_form") for c in DEMO_CRISSES):
        template = _api(
            client,
            "POST",
            "/admin/form-templates",
            headers=headers,
            json=FLOOD_FORM_TEMPLATE,
        )
        form_template_id = template["id"]
        print(f"Created flood form template: {form_template_id}")

    for crisis_spec in DEMO_CRISSES:
        onset = now - timedelta(days=crisis_spec["onset_days_ago"])
        create_payload: dict[str, Any] = {
            "name": crisis_spec["name"],
            "crisis_type": crisis_spec["crisis_type"],
            "crisis_subtype": crisis_spec["crisis_subtype"],
            "epicenter_lat": crisis_spec["epicenter_lat"],
            "epicenter_lng": crisis_spec["epicenter_lng"],
            "onset_at": onset.isoformat(),
        }
        if crisis_spec.get("custom_form") and form_template_id:
            create_payload["form_template_id"] = form_template_id

        crisis = _api(client, "POST", "/admin/crises", headers=headers, json=create_payload)
        crisis_id = crisis["id"]

        report_ids: list[str] = []
        for report_spec in crisis_spec["reports"]:
            collected_at = now - timedelta(days=report_spec["collected_days_ago"])
            report = create_report(client, crisis_id=crisis_id, spec=report_spec, collected_at=collected_at)
            report_id = report["id"]
            report_ids.append(report_id)

            photo_key = report_spec.get("photo")
            if photo_key and photo_key in image_paths:
                upload_photo(client, report_id, image_paths[photo_key], collected_at)

            set_report_status(client, report_id, report_spec.get("status", "pending"))

        if crisis_spec["status"] == "closed":
            _api(
                client,
                "PATCH",
                f"/admin/crises/{crisis_id}",
                headers=headers,
                json={"status": "closed"},
            )
            crisis["status"] = "closed"

        result["crises"].append(
            {
                "id": crisis_id,
                "name": crisis_spec["name"],
                "status": crisis_spec["status"],
                "report_ids": report_ids,
            }
        )
        print(f"  {crisis_spec['name']}: {len(report_ids)} reports")

    unlisted_id = _api(client, "GET", "/crises/reporting-options")["unlisted_crisis_id"]
    for spec in UNLISTED_REPORTS:
        collected_at = now - timedelta(days=spec["collected_days_ago"])
        report = create_report(client, crisis_id=unlisted_id, spec=spec, collected_at=collected_at)
        report_id = report["id"]
        photo_key = spec.get("photo")
        if photo_key and photo_key in image_paths:
            upload_photo(client, report_id, image_paths[photo_key], collected_at)
        result["unlisted_reports"].append(report_id)

    print(f"  Unlisted: {len(UNLISTED_REPORTS)} reports")
    return result


def print_plan() -> None:
    total_listed = sum(len(c["reports"]) for c in DEMO_CRISSES)
    print(f"Demo plan: {len(DEMO_CRISSES)} crises, {total_listed} listed reports, {len(UNLISTED_REPORTS)} unlisted")
    for crisis in DEMO_CRISSES:
        groups: dict[str, int] = {}
        for r in crisis["reports"]:
            g = r.get("location_group", r["infra_name"])
            groups[g] = groups.get(g, 0) + 1
        stacks = [f"{k} ({v} versions)" for k, v in groups.items() if v > 1]
        stack_note = f" — stacks: {', '.join(stacks)}" if stacks else ""
        print(f"  • {crisis['name']} [{crisis['status']}]: {len(crisis['reports'])} reports{stack_note}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed curated CrisisMap demo data")
    parser.add_argument("--api-url", default="http://localhost:8000/api/v1")
    parser.add_argument("--purge-ad-hoc", action="store_true", help="Delete ad-hoc demo crises only")
    parser.add_argument("--no-wipe", action="store_true", help="Skip wiping existing data")
    parser.add_argument("--fetch-images", action="store_true", help="Re-download demo photos")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.dry_run:
        print_plan()
        return 0

    settings = get_settings()

    if args.purge_ad_hoc:
        with httpx.Client(base_url=args.api_url.rstrip("/"), timeout=180.0) as client:
            delete_ad_hoc_demo_crises(client, settings)
        return 0

    if not settings.admin_password:
        print("Error: ADMIN_PASSWORD must be set in backend/.env", file=sys.stderr)
        return 1

    admin_password = settings.admin_password.get_secret_value()
    now = datetime.now(timezone.utc)

    print("CrisisMap demo seed")
    print_plan()
    print()

    manifest = load_manifest()
    print("Preparing demo images…")
    image_paths = ensure_images(manifest, force=args.fetch_images)
    print(f"  {len(image_paths)} images ready in {IMAGES_DIR}")
    print()

    with httpx.Client(base_url=args.api_url.rstrip("/"), timeout=180.0) as client:
        apply_migration_007(settings)
        delete_ad_hoc_demo_crises(client, settings)

        if not args.no_wipe:
            wipe_demo_data(client, settings)
            print()

        admin_token = admin_login(client, admin_password)
        print("Admin login OK")

        unlisted_id = _api(client, "GET", "/crises/reporting-options")["unlisted_crisis_id"]
        verify_submission_channels(client, unlisted_id, admin_token=admin_token)

        print("Seeding curated demo data…")

        result = seed_demo(client, admin_token=admin_token, image_paths=image_paths, now=now)

        out_path = SCRIPT_DIR / "demo_seed_result.json"
        out_path.write_text(json.dumps(result, indent=2))
        print()
        print(f"Done. Result saved to {out_path}")
        print("Open the dashboard map and admin panel to review the demo dataset.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
