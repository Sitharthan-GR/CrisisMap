-- Simplify submission_channel to mobile | web (drop app, whatsapp, sms).

UPDATE report
SET submission_channel = 'mobile'
WHERE submission_channel IN ('app', 'whatsapp', 'sms');

UPDATE report
SET submission_channel = 'web'
WHERE submission_channel NOT IN ('mobile', 'web');

ALTER TABLE report DROP CONSTRAINT IF EXISTS report_submission_channel_check;
ALTER TABLE report
    ADD CONSTRAINT report_submission_channel_check
    CHECK (submission_channel IN ('mobile', 'web'));

COMMENT ON COLUMN report.submission_channel IS
    'How the report was submitted: mobile (phone/tablet) or web (desktop browser).';
