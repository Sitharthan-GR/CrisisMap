-- Performance: indexes + RPC functions for CrisisMap
-- Run in Supabase SQL Editor after 001–003 migrations.
--
-- Expected wins:
--   • GET /crises/{id}/map        — replaces N+1 photo lookups (largest gain)
--   • GET /crises/reporting-options — one round trip instead of two
--   • report create location match  — PostGIS nearest lookup
--   • export photo counts           — batch instead of per-report queries
--
-- After applying, re-run: python scripts/benchmark_api.py --compare scripts/benchmark_baseline.json
-- Backend code must call these RPCs (see backend/README.md § Performance).

-- ---------------------------------------------------------------------------
-- Extensions (on Supabase, PostGIS objects live in the "extensions" schema)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Map pins: crisis + latest version (+ optional status / damage / infra filters)
CREATE INDEX IF NOT EXISTS idx_report_crisis_latest
    ON report (crisis_id)
    WHERE is_latest_version = true;

CREATE INDEX IF NOT EXISTS idx_report_crisis_status_latest
    ON report (crisis_id, status)
    WHERE is_latest_version = true;

CREATE INDEX IF NOT EXISTS idx_report_crisis_damage_latest
    ON report (crisis_id, damage_level)
    WHERE is_latest_version = true;

CREATE INDEX IF NOT EXISTS idx_report_crisis_infra_latest
    ON report (crisis_id, infra_type)
    WHERE is_latest_version = true;

-- Paginated report lists
CREATE INDEX IF NOT EXISTS idx_report_crisis_collected
    ON report (crisis_id, collected_at DESC)
    WHERE is_latest_version = true;

-- Version history + thumbnail lookup per location
CREATE INDEX IF NOT EXISTS idx_report_location_latest
    ON report (location_id, is_latest_version, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_location_versions
    ON report (location_id, version_number DESC);

-- Location dedup bounding-box scan (create report)
CREATE INDEX IF NOT EXISTS idx_location_lat_lng
    ON location (latitude, longitude);

-- Faster geospatial nearest-neighbor (requires lat/lng populated)
CREATE INDEX IF NOT EXISTS idx_location_geog
    ON location
    USING GIST (
        extensions.geography(
            extensions.ST_SetSRID(
                extensions.ST_MakePoint(
                    longitude::double precision,
                    latitude::double precision
                ),
                4326
            )
        )
    );

-- Latest photo per report (map thumbnails, detail view)
CREATE INDEX IF NOT EXISTS idx_photo_report_uploaded
    ON photo (report_id, uploaded_at DESC);

-- Active / unlisted crisis lookups
CREATE INDEX IF NOT EXISTS idx_crisis_active_public
    ON crisis (onset_at DESC)
    WHERE status = 'active' AND is_unlisted = false;

-- App expects a single "Unlisted" crisis; merge duplicates before unique index
DO $$
DECLARE
    canonical_id uuid;
BEGIN
    SELECT id INTO canonical_id
    FROM crisis
    WHERE is_unlisted = true
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1;

    IF canonical_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE report
    SET crisis_id = canonical_id
    WHERE crisis_id IN (
        SELECT id
        FROM crisis
        WHERE is_unlisted = true
          AND id <> canonical_id
    );

    UPDATE crisis
    SET is_unlisted = false
    WHERE is_unlisted = true
      AND id <> canonical_id;
END $$;

DROP INDEX IF EXISTS idx_crisis_unlisted_singleton;
CREATE UNIQUE INDEX idx_crisis_unlisted_singleton
    ON crisis (is_unlisted)
    WHERE is_unlisted = true;

-- Admin export date-range filters
CREATE INDEX IF NOT EXISTS idx_report_export
    ON report (crisis_id, status, collected_at)
    WHERE is_latest_version = true;

-- ---------------------------------------------------------------------------
-- RPC: map pins with latest photo path (replaces N+1 in app/services/map.py)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_crisis_map_pins(
    p_crisis_id uuid,
    p_status text DEFAULT NULL,
    p_damage_level text DEFAULT NULL,
    p_infra_type text DEFAULT NULL,
    p_min_lng double precision DEFAULT NULL,
    p_min_lat double precision DEFAULT NULL,
    p_max_lng double precision DEFAULT NULL,
    p_max_lat double precision DEFAULT NULL
)
RETURNS TABLE (
    location_id uuid,
    report_id uuid,
    latitude double precision,
    longitude double precision,
    damage_level text,
    infra_type text,
    report_count integer,
    admin_level_2 text,
    geohash text,
    latest_photo_storage_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        l.id AS location_id,
        r.id AS report_id,
        l.latitude,
        l.longitude,
        r.damage_level::text,
        r.infra_type::text,
        COALESCE(l.report_count, 1) AS report_count,
        l.admin_level_2,
        l.geohash,
        latest_photo.storage_url AS latest_photo_storage_url
    FROM report r
    INNER JOIN location l ON l.id = r.location_id
    LEFT JOIN LATERAL (
        SELECT p.storage_url
        FROM photo p
        WHERE p.report_id = r.id
        ORDER BY p.uploaded_at DESC
        LIMIT 1
    ) latest_photo ON true
    WHERE r.crisis_id = p_crisis_id
      AND r.is_latest_version = true
      AND (
          p_status IS NULL
          OR p_status = 'all'
          OR r.status::text = p_status
      )
      AND (p_damage_level IS NULL OR r.damage_level::text = p_damage_level)
      AND (p_infra_type IS NULL OR r.infra_type::text = p_infra_type)
      AND (
          p_min_lng IS NULL
          OR (
              l.longitude BETWEEN p_min_lng AND p_max_lng
              AND l.latitude BETWEEN p_min_lat AND p_max_lat
          )
      );
$$;

COMMENT ON FUNCTION get_crisis_map_pins IS
    'Returns map pin rows for a crisis with latest photo storage path in one query.';

-- ---------------------------------------------------------------------------
-- RPC: reporting wizard options (replaces 2 queries in get_reporting_options)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_reporting_options_data()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT json_build_object(
        'crises',
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', c.id,
                        'name', c.name,
                        'crisis_type', c.crisis_type,
                        'crisis_subtype', c.crisis_subtype,
                        'epicenter_lat', c.epicenter_lat,
                        'epicenter_lng', c.epicenter_lng,
                        'status', c.status,
                        'is_unlisted', c.is_unlisted,
                        'form_template_id', c.form_template_id,
                        'onset_at', c.onset_at,
                        'created_at', c.created_at
                    )
                    ORDER BY c.onset_at DESC
                )
                FROM crisis c
                WHERE c.status = 'active'
                  AND c.is_unlisted = false
            ),
            '[]'::json
        ),
        'unlisted_crisis_id', (
            SELECT u.id
            FROM crisis u
            WHERE u.is_unlisted = true
            LIMIT 1
        )
    );
$$;

COMMENT ON FUNCTION get_reporting_options_data IS
    'Active public crises + unlisted crisis id for the report wizard.';

-- ---------------------------------------------------------------------------
-- RPC: find existing location within tolerance (report create dedup)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_location_within_meters(
    p_lat double precision,
    p_lng double precision,
    p_tolerance_meters double precision DEFAULT 5
)
RETURNS SETOF location
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT l.*
    FROM location l
    WHERE l.latitude IS NOT NULL
      AND l.longitude IS NOT NULL
      AND ST_DWithin(
          geography(
              ST_SetSRID(
                  ST_MakePoint(l.longitude::double precision, l.latitude::double precision),
                  4326
              )
          ),
          geography(
              ST_SetSRID(
                  ST_MakePoint(p_lng::double precision, p_lat::double precision),
                  4326
              )
          ),
          p_tolerance_meters
      )
    ORDER BY ST_Distance(
        geography(
            ST_SetSRID(
                ST_MakePoint(l.longitude::double precision, l.latitude::double precision),
                4326
            )
        ),
        geography(
            ST_SetSRID(
                ST_MakePoint(p_lng::double precision, p_lat::double precision),
                4326
            )
        )
    )
    LIMIT 1;
$$;

COMMENT ON FUNCTION find_location_within_meters IS
    'Nearest location within p_tolerance_meters for deduplicating report locations.';

-- ---------------------------------------------------------------------------
-- RPC: batch photo counts (export service)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_photo_counts(p_report_ids uuid[])
RETURNS TABLE (
    report_id uuid,
    photo_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.report_id, COUNT(*)::bigint
    FROM photo p
    WHERE p.report_id = ANY (p_report_ids)
    GROUP BY p.report_id;
$$;

COMMENT ON FUNCTION get_photo_counts IS
    'Photo counts for many reports in one query (admin export).';

-- ---------------------------------------------------------------------------
-- RPC: report detail with photos (optional — report detail panel)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_report_with_photos(p_report_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT json_build_object(
        'report', row_to_json(r.*),
        'location', row_to_json(l.*),
        'photos', COALESCE(
            (
                SELECT json_agg(row_to_json(p.*) ORDER BY p.uploaded_at ASC)
                FROM photo p
                WHERE p.report_id = r.id
            ),
            '[]'::json
        )
    )
    FROM report r
    LEFT JOIN location l ON l.id = r.location_id
    WHERE r.id = p_report_id;
$$;

COMMENT ON FUNCTION get_report_with_photos IS
    'Single report row, location, and all photos as JSON.';

-- ---------------------------------------------------------------------------
-- Grants (Supabase PostgREST exposes functions in public schema)
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_crisis_map_pins TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION get_reporting_options_data TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION find_location_within_meters TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION get_photo_counts TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION get_report_with_photos TO service_role, authenticated, anon;
