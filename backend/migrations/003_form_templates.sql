-- Form templates for customizable crisis reporting forms
CREATE TABLE IF NOT EXISTS form_template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'Incident Report',
    intro TEXT,
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_template_name ON form_template (name);

-- Link crises to optional custom form templates (NULL = built-in default wizard)
ALTER TABLE crisis
    ADD COLUMN IF NOT EXISTS form_template_id UUID REFERENCES form_template (id) ON DELETE SET NULL;

COMMENT ON COLUMN crisis.form_template_id IS 'Custom report form template; NULL uses the built-in standard damage report wizard.';

-- Store custom form field responses on reports
ALTER TABLE report
    ADD COLUMN IF NOT EXISTS form_responses JSONB;

COMMENT ON COLUMN report.form_responses IS 'JSON object of field_id -> value for custom form template submissions.';
