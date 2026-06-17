-- Run in Supabase SQL editor.
ALTER TABLE crisis
  ADD COLUMN IF NOT EXISTS is_unlisted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN crisis.is_unlisted IS 'When true, crisis is hidden from public lists; used for Other/unlisted reports.';
