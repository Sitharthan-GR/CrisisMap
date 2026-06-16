-- Run in Supabase SQL editor before using reporter names in the app.
ALTER TABLE report
  ADD COLUMN IF NOT EXISTS reporter_name text NOT NULL DEFAULT 'anonymous';

COMMENT ON COLUMN report.reporter_name IS 'Display name of submitter; anonymous when not provided.';
