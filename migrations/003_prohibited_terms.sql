-- Migration 003: Prohibited Terms Table
--
-- COMPLIANCE NOTE:
-- This migration creates the schema only.
-- No word data is inserted here.
-- The actual prohibited-term list must be seeded via the secure
-- compliance-admin tooling (out-of-band from this repository).
-- Direct SQL INSERT of prohibited terms into any repository file is prohibited.

CREATE TABLE IF NOT EXISTS prohibited_terms (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  locale       VARCHAR(5)  NOT NULL,
  pattern      TEXT        NOT NULL,
  replacement  TEXT,                    -- NULL → use '[内容削除]'
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  active       BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT prohibited_terms_locale_check
    CHECK (locale IN ('ja', 'en', 'zh')),
  CONSTRAINT prohibited_terms_pattern_nonempty
    CHECK (length(trim(pattern)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_prohibited_terms_locale_active
  ON prohibited_terms (locale, active, sort_order);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION set_prohibited_terms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prohibited_terms_updated_at
  BEFORE UPDATE ON prohibited_terms
  FOR EACH ROW EXECUTE FUNCTION set_prohibited_terms_updated_at();
