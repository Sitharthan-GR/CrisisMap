-- Admin dashboard: crises + per-crisis report stats + unlisted count in one RPC.
-- Replaces N map API round-trips on the admin crises table.

CREATE OR REPLACE FUNCTION get_admin_dashboard_data()
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
            ),
            '[]'::json
        ),
        'stats',
        COALESCE(
            (
                SELECT json_object_agg(
                    s.crisis_id::text,
                    json_build_object(
                        'total', s.total_pins,
                        'sev', json_build_object(
                            'complete', s.complete,
                            'partial', s.partial,
                            'minimal', s.minimal
                        )
                    )
                )
                FROM (
                    SELECT
                        r.crisis_id,
                        COUNT(*)::int AS total_pins,
                        SUM(
                            CASE
                                WHEN r.damage_level = 'complete'
                                THEN COALESCE(l.report_count, 1)
                                ELSE 0
                            END
                        )::int AS complete,
                        SUM(
                            CASE
                                WHEN r.damage_level = 'partial'
                                THEN COALESCE(l.report_count, 1)
                                ELSE 0
                            END
                        )::int AS partial,
                        SUM(
                            CASE
                                WHEN r.damage_level = 'minimal'
                                THEN COALESCE(l.report_count, 1)
                                ELSE 0
                            END
                        )::int AS minimal
                    FROM report r
                    INNER JOIN location l ON l.id = r.location_id
                    INNER JOIN crisis c ON c.id = r.crisis_id
                    WHERE r.is_latest_version = true
                      AND c.is_unlisted = false
                    GROUP BY r.crisis_id
                ) s
            ),
            '{}'::json
        ),
        'unlisted_count',
        COALESCE(
            (
                SELECT COUNT(*)::int
                FROM report r
                WHERE r.crisis_id = (
                    SELECT u.id
                    FROM crisis u
                    WHERE u.is_unlisted = true
                    LIMIT 1
                )
                  AND r.is_latest_version = true
            ),
            0
        )
    );
$$;

COMMENT ON FUNCTION get_admin_dashboard_data IS
    'Admin page payload: all crises, per-crisis report stats, and unlisted report count.';

GRANT EXECUTE ON FUNCTION get_admin_dashboard_data TO service_role, authenticated, anon;
