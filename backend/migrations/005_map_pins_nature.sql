-- Add nature_of_crisis to map pin RPC for cause-based marker icons.

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
    nature_of_crisis text,
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
        r.nature_of_crisis,
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
    'Returns map pin rows for a crisis with nature, damage, and latest photo path.';

GRANT EXECUTE ON FUNCTION get_crisis_map_pins TO service_role, authenticated, anon;
