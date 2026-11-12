-- ============================================================
-- Migration 001: Extensions, System Config, Users/Roles
-- THALOS — Yugantar Growth Agentic AI Business OS
-- Apply to a FRESH Supabase project only.
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";   -- pgvector for RAG embeddings

-- ── System Configuration ─────────────────────────────────────
-- Non-secret runtime settings. API keys are NEVER stored here.
CREATE TABLE IF NOT EXISTS system_config (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        NOT NULL UNIQUE,
  value       TEXT        NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT        NOT NULL DEFAULT 'system'
);

-- Seed default system config values
INSERT INTO system_config (key, value, description) VALUES
  ('thalos_version',         '1.0.0',       'THALOS backend version'),
  ('worker_poll_interval_ms','5000',         'Worker job poll interval in milliseconds'),
  ('worker_max_concurrency', '3',            'Max concurrent jobs per worker instance'),
  ('max_steps_per_workflow', '50',           'Loop prevention: max steps per workflow run'),
  ('default_llm_capability', 'fast',         'Default LLM capability: fast|quality'),
  ('rag_chunk_size',         '800',          'RAG chunking: target characters per chunk'),
  ('rag_chunk_overlap',      '100',          'RAG chunking: overlap characters between chunks'),
  ('rag_top_k',              '5',            'RAG: max chunks returned per query'),
  ('approval_timeout_hours', '72',           'Hours before a pending approval expires'),
  ('job_max_attempts',       '3',            'Max retry attempts for a durable job'),
  ('job_lease_seconds',      '300',          'Worker lease duration in seconds'),
  ('dead_letter_after_ms',   '86400000',     'Move to dead letter after 24h of non-completion'),
  ('timezone',               'Asia/Kolkata', 'Default timezone for scheduling')
ON CONFLICT (key) DO NOTHING;

-- ── Tax Rate Configuration ────────────────────────────────────
-- GST/tax rates are NEVER hardcoded. Configurable by jurisdiction and effective date.
CREATE TABLE IF NOT EXISTS tax_rates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction    TEXT        NOT NULL,          -- e.g. 'IN', 'IN-GJ'
  rate_type       TEXT        NOT NULL,          -- e.g. 'GST', 'VAT'
  rate_percent    NUMERIC(6,4) NOT NULL,         -- e.g. 18.0000 for 18%
  effective_from  DATE        NOT NULL,
  effective_until DATE,                          -- NULL = currently active
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tax_rate_positive CHECK (rate_percent >= 0 AND rate_percent <= 100)
);

-- Current India GST — 18% from 2017; adjust as needed
INSERT INTO tax_rates (jurisdiction, rate_type, rate_percent, effective_from, description)
VALUES ('IN', 'GST', 18.0000, '2017-07-01', 'India GST standard rate — verify before use. LEGAL/ACCOUNTING DISCLAIMER: Tax calculations are for internal reference only. Consult a qualified CA for compliance.')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE tax_rates IS 'Tax rate configuration. DISCLAIMER: These rates are for internal reference only and do not constitute tax advice. Always verify with a qualified accountant.';

-- ── Updated-at Trigger Function (shared) ────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── RLS: Enable on all tables (enforced later per table) ─────
-- Service role bypasses RLS; authorization enforced in backend code AND here.
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates     ENABLE ROW LEVEL SECURITY;

-- Only service role can access these tables (all browser access is blocked)
CREATE POLICY "service_role_only" ON system_config
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON tax_rates
  USING (auth.role() = 'service_role');
