-- CrisisMap base schema for a fresh Supabase project.
-- Run this FIRST in the SQL Editor, then 001 → 007 in order.
--
-- Creates: crisis, location, report, photo
-- Plus triggers for geohash, report versioning, and location aggregates.
-- PostGIS is required (same as production / migration 004).

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crisis (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    crisis_type     TEXT NOT NULL
        CHECK (crisis_type IN ('natural_hazard', 'technological', 'human_made')),
    crisis_subtype  TEXT NOT NULL,
    epicenter_lat   DOUBLE PRECISION,
    epicenter_lng   DOUBLE PRECISION,
    status          TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'closed')),
    onset_at        TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    latitude                DOUBLE PRECISION,
    longitude               DOUBLE PRECISION,
    what3words              TEXT,
    building_footprint_id   TEXT,
    admin_level_1           TEXT,
    admin_level_2           TEXT,
    admin_level_3           TEXT,
    location_method         TEXT NOT NULL DEFAULT 'gps'
        CHECK (location_method IN ('gps', 'what3words', 'manual', 'exif')),
    latest_damage_level     TEXT
        CHECK (
            latest_damage_level IS NULL
            OR latest_damage_level IN ('minimal', 'partial', 'complete')
        ),
    report_count            INTEGER NOT NULL DEFAULT 0,
    last_updated_at         TIMESTAMPTZ,
    geohash                 TEXT
);

CREATE TABLE IF NOT EXISTS report (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crisis_id               UUID NOT NULL REFERENCES crisis (id) ON DELETE CASCADE,
    location_id             UUID NOT NULL REFERENCES location (id) ON DELETE RESTRICT,
    damage_level            TEXT NOT NULL
        CHECK (damage_level IN ('minimal', 'partial', 'complete')),
    infra_type              TEXT NOT NULL
        CHECK (infra_type IN (
            'residential', 'commercial', 'government', 'utility',
            'transport', 'community', 'public_space', 'other'
        )),
    infra_subtype           TEXT,
    infra_name              TEXT,
    debris_present          BOOLEAN NOT NULL,
    nature_of_crisis        TEXT,
    description_raw         TEXT,
    description_translated  TEXT,
    source_language         TEXT,
    is_latest_version       BOOLEAN NOT NULL DEFAULT true,
    version_number          INTEGER NOT NULL DEFAULT 1,
    -- Allow legacy values so migration 007 can tighten to mobile|web
    submission_channel      TEXT NOT NULL
        CHECK (submission_channel IN ('mobile', 'web', 'app', 'whatsapp', 'sms')),
    status                  TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'validated', 'rejected')),
    collected_at            TIMESTAMPTZ NOT NULL,
    submitted_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photo (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id        UUID NOT NULL REFERENCES report (id) ON DELETE CASCADE,
    storage_url      TEXT NOT NULL,
    file_size_kb     INTEGER,
    mime_type        TEXT
        CHECK (
            mime_type IS NULL
            OR mime_type IN ('image/jpeg', 'image/png', 'image/webp')
        ),
    captured_at      TIMESTAMPTZ,
    gps_lat          DOUBLE PRECISION,
    gps_lng          DOUBLE PRECISION,
    uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ai_damage_label  TEXT
        CHECK (
            ai_damage_label IS NULL
            OR ai_damage_label IN ('minimal', 'partial', 'complete')
        ),
    ai_confidence    DOUBLE PRECISION,
    ai_debris_tags   JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- ---------------------------------------------------------------------------
-- Triggers: geohash on location insert/update
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_location_geohash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geohash := extensions.ST_GeoHash(
            extensions.ST_SetSRID(
                extensions.ST_MakePoint(NEW.longitude, NEW.latitude),
                4326
            ),
            12
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_location_geohash ON location;
CREATE TRIGGER trg_location_geohash
    BEFORE INSERT OR UPDATE OF latitude, longitude
    ON location
    FOR EACH ROW
    EXECUTE FUNCTION set_location_geohash();

-- ---------------------------------------------------------------------------
-- Triggers: report versioning + location aggregates on insert
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION on_report_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    next_version integer;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM report
    WHERE location_id = NEW.location_id;

    NEW.version_number := next_version;
    NEW.is_latest_version := true;

    UPDATE report
    SET is_latest_version = false
    WHERE location_id = NEW.location_id
      AND is_latest_version = true;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_insert_versioning ON report;
CREATE TRIGGER trg_report_insert_versioning
    BEFORE INSERT ON report
    FOR EACH ROW
    EXECUTE FUNCTION on_report_insert();

CREATE OR REPLACE FUNCTION on_report_after_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE location
    SET
        report_count = (
            SELECT COUNT(*)::integer FROM report WHERE location_id = NEW.location_id
        ),
        latest_damage_level = NEW.damage_level,
        last_updated_at = NEW.submitted_at
    WHERE id = NEW.location_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_after_insert_aggregates ON report;
CREATE TRIGGER trg_report_after_insert_aggregates
    AFTER INSERT ON report
    FOR EACH ROW
    EXECUTE FUNCTION on_report_after_insert();

COMMENT ON TABLE crisis IS 'Crisis events shown on the map and in reporting options.';
COMMENT ON TABLE location IS 'Deduplicated map pins; reports at the same spot share one location.';
COMMENT ON TABLE report IS 'Damage reports; multiple versions can share one location_id.';
COMMENT ON TABLE photo IS 'Photo metadata; files live in Supabase Storage (rapida-photos).';
