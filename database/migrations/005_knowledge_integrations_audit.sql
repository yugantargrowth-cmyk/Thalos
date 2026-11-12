-- ============================================================
-- Migration 005: Knowledge Base, RAG, Integrations, Audit Log
-- ============================================================

-- ── Knowledge Documents ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  original_filename TEXT       NOT NULL,
  file_format      TEXT        NOT NULL, -- md|pdf|csv|docx|doc|txt|xlsx|xls|json
  mime_type        TEXT        NOT NULL,
  storage_path     TEXT,       -- Supabase Storage path (signed URL generated at access time)
  file_size_bytes  BIGINT      NOT NULL DEFAULT 0,
  checksum_sha256  TEXT        NOT NULL,
  version          INTEGER     NOT NULL DEFAULT 1,
  previous_version_id UUID     REFERENCES documents(id),
  status           TEXT        NOT NULL DEFAULT 'pending',
  -- pending|ingesting|indexed|failed|superseded|deleted
  parse_method     TEXT,       -- text_extraction|ocr|csv_parse|xlsx_parse|json_parse
  page_count       INTEGER,
  char_count       INTEGER,
  has_extractable_text BOOLEAN NOT NULL DEFAULT true,
  -- false = scanned PDF or image-only; OCR required or mark as not indexed
  ocr_used         BOOLEAN     NOT NULL DEFAULT false,
  parse_error      TEXT,       -- Populated if status=failed
  category         TEXT        NOT NULL DEFAULT 'general',
  -- company|services|market|client|process|personal|general
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  source_url       TEXT,
  uploaded_by      TEXT        NOT NULL DEFAULT 'founder',
  ingestion_job_id UUID,
  embedding_model  TEXT,       -- Model ID used for embeddings (MUST be stored per version)
  embedding_dimensions INTEGER, -- Dimensions of embedding vectors (MUST be stored per version)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_format_valid CHECK (file_format IN (
    'md','markdown','pdf','csv','docx','doc','txt','xls','xlsx','json'
  )),
  CONSTRAINT document_status_valid CHECK (status IN (
    'pending','ingesting','indexed','failed','superseded','deleted'
  ))
);

CREATE INDEX documents_status_idx ON documents(status);
CREATE INDEX documents_category_idx ON documents(category);
CREATE INDEX documents_checksum_idx ON documents(checksum_sha256);
-- FTS on document title
CREATE INDEX documents_fts_idx ON documents
  USING gin(to_tsvector('english', title || ' ' || COALESCE(original_filename,'')));

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON documents USING (auth.role() = 'service_role');

-- ── Document Chunks ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_chunks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index      INTEGER     NOT NULL,
  content          TEXT        NOT NULL,
  char_count       INTEGER     NOT NULL,
  page_number      INTEGER,
  section_title    TEXT,
  source_url       TEXT,       -- URL if chunk came from web research
  embedding        vector,     -- pgvector — dimensions must match document.embedding_dimensions
  embedding_model  TEXT,       -- Model ID (same as document.embedding_model)
  fts_vector       tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX document_chunks_document_idx ON document_chunks(document_id);
CREATE INDEX document_chunks_fts_idx ON document_chunks USING gin(fts_vector);
-- Vector index — created after embeddings are populated
-- CREATE INDEX document_chunks_vector_idx ON document_chunks
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- NOTE: Create this index AFTER bulk embedding. See scripts/create_vector_index.sql

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON document_chunks USING (auth.role() = 'service_role');

-- ── Knowledge Nodes (structured business knowledge) ───────────
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT        NOT NULL,
  -- company|services|market|client|process|personal|agent_memory
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  source_type  TEXT        NOT NULL DEFAULT 'founder_stated',
  -- founder_stated|agent_derived|imported_document|web_research
  source_ref   TEXT,       -- document_id or URL if applicable
  embedding    vector,
  fts_vector   tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || content)) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_nodes_fts_idx ON knowledge_nodes USING gin(fts_vector);
CREATE INDEX knowledge_nodes_category_idx ON knowledge_nodes(category);
CREATE INDEX knowledge_nodes_tags_idx ON knowledge_nodes USING gin(tags);

CREATE TRIGGER knowledge_nodes_updated_at
  BEFORE UPDATE ON knowledge_nodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE knowledge_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON knowledge_nodes USING (auth.role() = 'service_role');

-- ── Integrations (provider metadata — NO plaintext secrets) ──
CREATE TABLE IF NOT EXISTS integrations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id      TEXT        NOT NULL UNIQUE,  -- e.g. 'groq','gemini','tavily'
  display_name        TEXT        NOT NULL,
  provider_type       TEXT        NOT NULL, -- llm|search|email|ocr|storage|automation|custom
  status              TEXT        NOT NULL DEFAULT 'not_configured',
  -- not_configured|configured|connected|tested|operational|disabled|error
  credential_ref      TEXT        UNIQUE,   -- Vault secret name or envelope key ref (NOT the key itself)
  credential_hint     TEXT,                 -- Masked hint, e.g. 'gsk_...4f2a' (last 4 chars)
  credential_version  INTEGER     NOT NULL DEFAULT 0,
  credential_set_at   TIMESTAMPTZ,
  primary_model       TEXT,
  fallback_model      TEXT,
  model_capability    TEXT        DEFAULT 'fast', -- fast|quality
  base_url            TEXT,       -- Fixed/allowlisted per integration — prevents SSRF
  is_primary          BOOLEAN     NOT NULL DEFAULT false,
  is_fallback         BOOLEAN     NOT NULL DEFAULT false,
  priority            INTEGER     NOT NULL DEFAULT 10,
  -- Connection test fields
  last_tested_at      TIMESTAMPTZ,
  last_test_result    TEXT,       -- success|failure
  last_test_latency_ms INTEGER,
  last_test_error     TEXT,       -- Sanitised error — no key values in here
  -- Usage/quota (populated where provider exposes it)
  quota_used          INTEGER,
  quota_limit         INTEGER,
  quota_reset_at      TIMESTAMPTZ,
  capabilities        TEXT[]      NOT NULL DEFAULT '{}',
  -- ['chat','embeddings','transcription','search','email','ocr']
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integration_status_valid CHECK (status IN (
    'not_configured','configured','connected','tested','operational','disabled','error'
  ))
);

-- Seed the initial provider registry (all start as not_configured)
INSERT INTO integrations (integration_id, display_name, provider_type, status, capabilities, base_url, metadata) VALUES
('groq',       'Groq',                 'llm',       'not_configured', ARRAY['chat','transcription'], 'https://api.groq.com', '{"docs":"https://console.groq.com/docs","pricing":"https://console.groq.com/docs/rate-limits","last_verified":"2026-11-04"}'::jsonb),
('gemini',     'Google Gemini',        'llm',       'not_configured', ARRAY['chat','embeddings'],    'https://generativelanguage.googleapis.com', '{"docs":"https://ai.google.dev/gemini-api/docs","pricing":"https://ai.google.dev/gemini-api/docs/pricing","privacy_note":"Free tier content may be used to improve Google products. Do not send confidential data without explicit privacy approval.","last_verified":"2026-11-04"}'::jsonb),
('cloudflare', 'Cloudflare Workers AI','llm',       'not_configured', ARRAY['chat','embeddings'],    'https://api.cloudflare.com', '{"docs":"https://developers.cloudflare.com/workers-ai/","pricing":"https://developers.cloudflare.com/workers-ai/platform/pricing/","note":"10000 Neurons/day free as of 2026-10-01; some models require paid billing","last_verified":"2026-11-04"}'::jsonb),
('searxng',    'SearXNG (Self-hosted)', 'search',    'not_configured', ARRAY['search'],               null, '{"docs":"https://docs.searxng.org/","note":"Self-hosted instance required. Configure SEARXNG_BASE_URL in bootstrap config.","last_verified":"2026-11-04"}'::jsonb),
('tavily',     'Tavily Search',        'search',    'not_configured', ARRAY['search'],               'https://api.tavily.com', '{"docs":"https://docs.tavily.com/","pricing":"https://www.tavily.com/pricing","note":"1000 API credits/month on free tier (no credit card). Credit usage varies by operation.","last_verified":"2026-11-04"}'::jsonb),
('resend',     'Resend Email',         'email',     'not_configured', ARRAY['email'],                'https://api.resend.com', '{"docs":"https://resend.com/docs","pricing":"https://resend.com/pricing","note":"3000 emails/month, 100/day on free plan. Requires sender domain verification.","last_verified":"2026-11-04"}'::jsonb),
('ocr_space',  'OCR.Space',            'ocr',       'not_configured', ARRAY['ocr'],                  'https://api.ocr.space', '{"docs":"https://ocr.space/ocrapi","note":"500 requests/day per IP on free tier. Do NOT use for confidential documents without explicit privacy approval.","last_verified":"2026-11-04"}'::jsonb),
('n8n',        'n8n (External)',       'automation','disabled',       ARRAY['automation'],            null, '{"note":"n8n is not part of the initial THALOS architecture. This integration is reserved for future use. Do not enable without founder approval of a separate n8n deployment."}'::jsonb)
ON CONFLICT (integration_id) DO NOTHING;

CREATE INDEX integrations_status_idx ON integrations(status);

CREATE TRIGGER integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON integrations USING (auth.role() = 'service_role');

-- ── Integration Health Tests ───────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_health_tests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id   TEXT        NOT NULL REFERENCES integrations(integration_id),
  test_type        TEXT        NOT NULL DEFAULT 'connection', -- connection|model_list|ping
  result           TEXT        NOT NULL,                     -- success|failure
  latency_ms       INTEGER,
  error_message    TEXT,       -- Sanitised — never includes key values
  initiated_by     TEXT        NOT NULL DEFAULT 'founder',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Read-only history: no UPDATE or DELETE
CREATE INDEX integration_health_integration_idx ON integration_health_tests(integration_id, created_at DESC);

ALTER TABLE integration_health_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON integration_health_tests USING (auth.role() = 'service_role');

-- ── Tool Execution History ────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_executions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id          TEXT        NOT NULL,
  agent_id         TEXT,
  job_id           UUID        REFERENCES jobs(id),
  workflow_run_id  UUID        REFERENCES workflow_runs(id),
  status           TEXT        NOT NULL DEFAULT 'running',
  -- running|completed|failed|timeout|rejected
  inputs_hash      TEXT        NOT NULL, -- SHA-256 of inputs (not the inputs themselves if sensitive)
  output           JSONB,
  error            TEXT,
  evidence         TEXT,       -- Provider message ID, URL, 'manual_handoff', or null
  verification_status TEXT     DEFAULT 'unverified',
  -- unverified|verified|failed_verification|not_applicable
  duration_ms      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  CONSTRAINT tool_exec_status_valid CHECK (status IN ('running','completed','failed','timeout','rejected')),
  CONSTRAINT tool_exec_verification_valid CHECK (verification_status IN (
    'unverified','verified','failed_verification','not_applicable'
  ))
);

CREATE INDEX tool_executions_tool_idx ON tool_executions(tool_id, created_at DESC);
CREATE INDEX tool_executions_job_idx ON tool_executions(job_id);

ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON tool_executions USING (auth.role() = 'service_role');

-- ── Conversations and Daily Briefs ────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date DATE        NOT NULL UNIQUE,
  messages     JSONB       NOT NULL DEFAULT '[]',
  -- [{role, content, timestamp, agent?, intent?, tool_calls?}]
  token_count  INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON conversations USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS daily_briefs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_date       DATE        NOT NULL UNIQUE,
  content          TEXT        NOT NULL,
  context_snapshot JSONB       NOT NULL DEFAULT '{}',
  model_used       TEXT,
  token_count      INTEGER,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON daily_briefs USING (auth.role() = 'service_role');

-- ── Append-Only Audit Log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   TEXT        NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  agent        TEXT,
  actor        TEXT        NOT NULL DEFAULT 'system',
  description  TEXT        NOT NULL,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  ip_address   TEXT,       -- Hashed or truncated for privacy
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Immutability enforced via trigger — no UPDATE or DELETE allowed
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only. UPDATE and DELETE are forbidden.';
END;
$$;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE INDEX audit_log_event_idx ON audit_log(event_type, created_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log(entity_type, entity_id);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Audit log: readable but not writable from service role (service role uses INSERT only)
CREATE POLICY "service_role_insert_only" ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_select" ON audit_log
  FOR SELECT USING (auth.role() = 'service_role');
