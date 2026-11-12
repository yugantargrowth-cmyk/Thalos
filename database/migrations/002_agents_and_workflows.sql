-- ============================================================
-- Migration 002: Agents, Workflows, Tasks, Durable Jobs
-- ============================================================

-- ── Agent Definitions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            TEXT        NOT NULL UNIQUE,  -- e.g. 'thalos', 'scout'
  display_name        TEXT        NOT NULL,
  version             TEXT        NOT NULL DEFAULT '1.0.0',
  mission             TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'active', -- active|suspended|deprecated
  system_instructions TEXT        NOT NULL,
  allowed_tools       TEXT[]      NOT NULL DEFAULT '{}',
  prohibited_actions  TEXT[]      NOT NULL DEFAULT '{}',
  model_capability    TEXT        NOT NULL DEFAULT 'fast', -- fast|quality
  approval_policy     TEXT        NOT NULL DEFAULT 'notify', -- auto|notify|require|forbidden
  risk_classification TEXT        NOT NULL DEFAULT 'low', -- low|medium|high|critical
  max_steps           INTEGER     NOT NULL DEFAULT 20,
  max_tokens_per_step INTEGER     NOT NULL DEFAULT 4096,
  timeout_seconds     INTEGER     NOT NULL DEFAULT 120,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_status_valid CHECK (status IN ('active','suspended','deprecated')),
  CONSTRAINT agent_approval_valid CHECK (approval_policy IN ('auto','notify','require','forbidden')),
  CONSTRAINT agent_risk_valid CHECK (risk_classification IN ('low','medium','high','critical'))
);

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed the 9-role THALOS team
INSERT INTO agents (agent_id, display_name, version, mission, system_instructions, allowed_tools, model_capability, approval_policy, risk_classification, max_steps) VALUES
(
  'thalos', 'THALOS', '1.0.0',
  'Central orchestrator and only founder-facing agent. Understands intent, plans, delegates to specialists, synthesises results and reports truthfully.',
  'You are THALOS, the AI business operating system for Yugantar Growth. You receive instructions from Shlok (the founder) only. You understand business intent, create execution plans, delegate to specialist agents, and synthesise results. You NEVER fabricate outcomes. You ask for clarification when intent is unclear. You report partial success honestly. You escalate blockers. You do not execute specialist tasks yourself — you delegate and coordinate.',
  ARRAY['save_to_db','search_knowledge','generate_business_report','export_business_data'],
  'quality', 'notify', 'low', 30
),
(
  'scout', 'Scout', '1.0.0',
  'Prospect and opportunity discovery. Finds potential leads from public sources.',
  'You are Scout, the prospect discovery specialist for Yugantar Growth. You search for businesses that match Yugantar''s ideal client profile using public web sources only. You return candidates with source URLs — not assumed facts. You never fabricate business information. You mark data as unverified until Researcher confirms it.',
  ARRAY['web_search','social_lookup','create_lead','save_to_db'],
  'fast', 'notify', 'low', 15
),
(
  'hunter', 'Hunter', '1.0.0',
  'Outreach drafting and follow-up progression. Creates personalised messages based on verified claims only.',
  'You are Hunter, the outreach specialist for Yugantar Growth. You draft WhatsApp and email messages for leads. You ONLY use verified_claims from the lead record — never fabricate or assume business details. Every claim in your draft must have a source. All outreach goes to the approval queue before any dispatch. You schedule follow-ups as records, not as delivered notifications.',
  ARRAY['draft_whatsapp','draft_email','log_lead_activity','schedule_follow_up','update_lead'],
  'quality', 'require', 'medium', 10
),
(
  'researcher', 'Researcher', '1.0.0',
  'Deep research, lead verification, knowledge retrieval and source provenance.',
  'You are Researcher, the verification and knowledge specialist for Yugantar Growth. You verify business facts from public sources only — websites, social media, public directories. You report what you found and what you could not find. You never fabricate URLs, follower counts, or business details. You distinguish between confirmed facts and observations. You retrieve relevant knowledge from the indexed knowledge base with citations.',
  ARRAY['web_search','website_audit','social_lookup','search_knowledge','update_lead','save_to_db'],
  'quality', 'notify', 'low', 20
),
(
  'analyst', 'Analyst', '1.0.0',
  'Business metrics, pipeline analysis, reporting and recommendations.',
  'You are Analyst, the business intelligence specialist for Yugantar Growth. You query authorised structured records to calculate KPIs, pipeline metrics and trends. You show your calculations. You separate observed facts from estimates. You include date ranges, filters, definitions and data freshness in every report. You never invent metrics or extrapolate without stating assumptions.',
  ARRAY['generate_business_report','export_business_data','search_knowledge','save_to_db'],
  'fast', 'notify', 'low', 15
),
(
  'operator', 'Operator', '1.0.0',
  'Business operations — clients, projects, tasks, milestones, and coordination.',
  'You are Operator, the internal operations specialist for Yugantar Growth. You create and manage clients, projects, tasks and milestones based on founder instructions. You track completion and escalate blockers. You do not send external communications without approval. You verify deliverables before marking complete.',
  ARRAY['create_client','create_project','update_project','create_task','update_task','save_to_db','log_lead_activity'],
  'fast', 'require', 'medium', 25
),
(
  'spark', 'Spark', '1.0.0',
  'Content strategy, ideation and content asset creation for Yugantar Growth.',
  'You are Spark, the content creation specialist for Yugantar Growth. You research audience context, create content briefs, captions, scripts and creative concepts. All content goes to the approval queue before any distribution. You do not publish content — that is Publisher''s role. You create text assets only unless a supported image tool is explicitly connected.',
  ARRAY['web_search','search_knowledge','draft_email','save_to_db'],
  'quality', 'require', 'medium', 15
),
(
  'publisher', 'Publisher', '1.0.0',
  'Approved content distribution, publishing through connected providers, and publication verification.',
  'You are Publisher, the content distribution specialist for Yugantar Growth. You publish ONLY content that has been approved by the founder. You publish ONLY through connected and authorised platform integrations. If no publishing integration is connected, you produce a manual publishing package and report clearly that publishing was not performed. You verify actual publication through provider ID, URL or status — not assumed success.',
  ARRAY['draft_email','send_email','save_to_db','log_lead_activity'],
  'fast', 'require', 'high', 10
),
(
  'closer', 'Closer', '1.0.0',
  'Qualification, objection research, proposal and deal progression. Cannot make autonomous commercial commitments.',
  'You are Closer, the deal progression specialist for Yugantar Growth. You review lead qualification, research objections and prepare proposals and invoices. You CANNOT autonomously promise discounts, change pricing, accept terms or bind contracts. All commercial commitments require founder approval. Proposals and invoices must be approved before sending. You record payment only from confirmed evidence or explicit founder entry.',
  ARRAY['build_proposal','build_invoice','update_lead','log_lead_activity','schedule_follow_up','save_to_db'],
  'quality', 'require', 'high', 15
)
ON CONFLICT (agent_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  version = EXCLUDED.version,
  updated_at = now();

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON agents USING (auth.role() = 'service_role');

-- ── Tool Definitions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tools (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id              TEXT        NOT NULL UNIQUE,
  display_name         TEXT        NOT NULL,
  description          TEXT        NOT NULL,
  version              TEXT        NOT NULL DEFAULT '1.0.0',
  category             TEXT        NOT NULL, -- research|communication|documents|data|automation
  permission_level     INTEGER     NOT NULL DEFAULT 0, -- 0=auto 1=notify 2=require 3=forbidden
  status               TEXT        NOT NULL DEFAULT 'needs_configuration',
  -- available|disabled|needs_configuration|deprecated
  unavailable_reason   TEXT,
  integration_id       TEXT,                 -- references integrations.integration_id
  input_schema         JSONB       NOT NULL DEFAULT '{}',
  output_schema        JSONB       NOT NULL DEFAULT '{}',
  read_scopes          TEXT[]      NOT NULL DEFAULT '{}',
  write_scopes         TEXT[]      NOT NULL DEFAULT '{}',
  requires_approval    BOOLEAN     NOT NULL DEFAULT false,
  timeout_seconds      INTEGER     NOT NULL DEFAULT 30,
  max_retries          INTEGER     NOT NULL DEFAULT 2,
  idempotent           BOOLEAN     NOT NULL DEFAULT false,
  success_evidence     TEXT        NOT NULL DEFAULT 'Response received from handler',
  failure_evidence     TEXT        NOT NULL DEFAULT 'Handler returned error or exception',
  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tool_category_valid CHECK (category IN ('research','communication','documents','data','automation')),
  CONSTRAINT tool_permission_valid CHECK (permission_level IN (0,1,2,3)),
  CONSTRAINT tool_status_valid CHECK (status IN ('available','disabled','needs_configuration','deprecated'))
);

CREATE TRIGGER tools_updated_at
  BEFORE UPDATE ON tools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed all 25 required tools
INSERT INTO tools (tool_id, display_name, description, category, permission_level, status, unavailable_reason, integration_id, requires_approval, timeout_seconds, idempotent, success_evidence, failure_evidence) VALUES
('web_search','Web Search','Search the web for business intelligence using SearXNG or Tavily fallback','research',0,'needs_configuration','Requires SearXNG self-hosted instance or Tavily API key to be configured in Integrations','searxng',false,30,false,'Search results returned with source URLs and timestamps','No results returned or provider error'),
('website_audit','Website Audit','Fetch and analyse a URL for business information. HTTP check only — does not run Lighthouse.','research',0,'available',null,null,false,45,false,'Website response received with metadata. Note: does not provide Lighthouse performance scores.','Fetch failed or timeout'),
('social_lookup','Social Lookup','Check business social media presence from public URLs only. Does not scrape or guarantee data.','research',0,'available',null,null,false,30,false,'Public profile data retrieved from provided URL. Source marked as unverified until confirmed.','URL not accessible or no public data'),
('draft_whatsapp','Draft WhatsApp','Compose a personalised WhatsApp message draft using verified lead claims only. Does not send.','communication',0,'available',null,null,false,10,true,'Draft created and saved to approval queue','Draft generation failed'),
('draft_email','Draft Email','Compose a personalised email draft. Does not send.','communication',0,'available',null,null,false,10,true,'Email draft created and saved','Draft generation failed'),
('build_proposal','Build Proposal','Generate a formatted proposal document with configurable tax rates. Requires approval before sending.','documents',0,'available',null,null,false,30,true,'Proposal record created with computed totals','Proposal generation failed'),
('build_invoice','Build Invoice','Generate a GST invoice from a proposal. Sequential invoice number assigned. Requires approval.','documents',0,'available',null,null,false,30,true,'Invoice record created with balance_due calculated','Invoice generation failed'),
('send_whatsapp','Send WhatsApp (Manual Handoff)','Generates a wa.me deep link for manual WhatsApp dispatch. This is NOT automated sending — founder must tap the link. Delivery is not verified.','communication',2,'available',null,null,true,10,false,'wa.me link generated. IMPORTANT: Actual message dispatch requires founder to tap the link. Delivery is not confirmed.','Link generation failed'),
('send_email','Send Email','Send email via configured provider (Resend). Requires Resend API key and verified sender domain in Integrations.','communication',2,'needs_configuration','Requires Resend API key and verified sender domain. Configure in Integrations page.','resend',true,30,false,'Provider message ID received and logged','Provider error or missing credentials'),
('sheets_import','Import CSV/Spreadsheet','Import leads from a CSV file. Does not use Google Sheets API — file upload only.','data',2,'available',null,null,true,120,false,'Records parsed, deduplicated and imported. Import report generated.','Parse error or validation failure'),
('save_to_db','Save to Database','Write a validated record to Supabase. Used by agents for creating/updating records.','data',0,'available',null,null,false,10,true,'Record persisted with ID returned','Database write error'),
('n8n_trigger','Trigger n8n Workflow','Trigger an n8n webhook. DISABLED — n8n is not in the initial architecture. Enable only after founder approves a separate n8n deployment.','automation',1,'needs_configuration','n8n is not part of the initial THALOS architecture. This tool is reserved for future use. Do not install n8n to enable this tool.','n8n',true,30,false,'n8n webhook acknowledged with run ID','n8n not configured or unreachable'),
('ingest_knowledge_file','Ingest Knowledge File','Upload and index a document into the knowledge base. Supported: .md .pdf .csv .docx .txt .xlsx .json','data',2,'available',null,null,true,300,false,'File parsed, chunked, embedded and indexed. Ingestion job completed.','Parse failure, unsupported format, or embedding error'),
('search_knowledge','Search Knowledge Base','Hybrid vector + full-text search of the indexed knowledge base with citations.','data',0,'available',null,null,false,15,false,'Relevant chunks returned with source citations','Search error or no index available'),
('create_lead','Create Lead','Create a new lead record with deduplication by phone number.','data',0,'available',null,null,false,10,true,'Lead record created with UUID. Duplicate phone rejected.','Validation error or duplicate phone'),
('update_lead','Update Lead','Update an existing lead record. Logs change to audit trail.','data',0,'available',null,null,false,10,false,'Lead updated and audit entry created','Lead not found or validation error'),
('log_lead_activity','Log Lead Activity','Append an activity entry to a lead''s activity log.','data',0,'available',null,null,false,10,true,'Activity entry appended with timestamp and agent','Lead not found or write error'),
('schedule_follow_up','Schedule Follow-Up','Create a follow-up reminder record for a lead or task. This creates a DB record — it does not guarantee notification delivery.','data',0,'available',null,null,false,10,true,'Follow-up record created. NOTE: This is a DB record only. Notification delivery is not guaranteed.','Validation error or write failure'),
('create_task','Create Task','Create a task record under a project.','data',0,'available',null,null,false,10,true,'Task record created','Project not found or validation error'),
('update_task','Update Task','Update task status, assignee or details.','data',0,'available',null,null,false,10,false,'Task updated and audit entry created','Task not found or validation error'),
('create_project','Create Project','Create a project under a client record.','data',0,'available',null,null,false,10,true,'Project record created','Client not found or validation error'),
('update_project','Update Project','Update project status, milestones or scope.','data',0,'available',null,null,false,10,false,'Project updated and audit entry created','Project not found or validation error'),
('create_client','Create Client','Convert a lead to client or create a new client record.','data',2,'available',null,null,true,10,true,'Client record created','Validation error or duplicate'),
('generate_business_report','Generate Business Report','Calculate and format a business intelligence report from structured DB records.','data',0,'available',null,null,false,60,false,'Report generated with sourced data, date range and definitions','Query error or insufficient data'),
('export_business_data','Export Business Data','Export structured business data as CSV or JSON for specified entity type and date range.','data',2,'available',null,null,true,60,false,'Export file generated and download link provided','Query error or permission denied')
ON CONFLICT (tool_id) DO UPDATE SET
  status = EXCLUDED.status,
  updated_at = now();

ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON tools USING (auth.role() = 'service_role');

-- ── Workflow Definitions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       TEXT        NOT NULL UNIQUE,
  display_name      TEXT        NOT NULL,
  description       TEXT        NOT NULL,
  version           TEXT        NOT NULL DEFAULT '1.0.0',
  status            TEXT        NOT NULL DEFAULT 'active',
  trigger_type      TEXT        NOT NULL, -- manual|scheduled|event
  input_schema      JSONB       NOT NULL DEFAULT '{}',
  output_schema     JSONB       NOT NULL DEFAULT '{}',
  steps             JSONB       NOT NULL DEFAULT '[]', -- DAG step definitions
  max_steps         INTEGER     NOT NULL DEFAULT 50,
  timeout_seconds   INTEGER     NOT NULL DEFAULT 3600,
  approval_required BOOLEAN     NOT NULL DEFAULT false,
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER workflow_definitions_updated_at
  BEFORE UPDATE ON workflow_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON workflow_definitions USING (auth.role() = 'service_role');

-- Seed the 7 required workflow definitions
INSERT INTO workflow_definitions (workflow_id, display_name, description, trigger_type, approval_required, timeout_seconds, steps) VALUES
(
  'lead_discovery', 'Lead Discovery', 'Scout discovers prospects → Researcher verifies → Analyst scores → THALOS persists',
  'manual', true, 7200,
  '[{"step":"scout_search","agent":"scout","tool":"web_search","depends_on":null},{"step":"researcher_verify","agent":"researcher","tools":["website_audit","social_lookup"],"depends_on":"scout_search"},{"step":"analyst_score","agent":"analyst","tool":"generate_business_report","depends_on":"researcher_verify"},{"step":"thalos_persist","agent":"thalos","tool":"create_lead","depends_on":"analyst_score","requires_approval":true}]'::jsonb
),
(
  'outreach', 'Outreach Preparation', 'Hunter drafts personalised message → approval gate → dispatch or manual handoff → activity log',
  'manual', true, 1800,
  '[{"step":"hunter_draft","agent":"hunter","tools":["draft_whatsapp","draft_email"],"depends_on":null},{"step":"approval_gate","type":"human_approval","depends_on":"hunter_draft"},{"step":"dispatch","agent":"hunter","tools":["send_whatsapp","send_email"],"depends_on":"approval_gate"},{"step":"log_activity","agent":"hunter","tool":"log_lead_activity","depends_on":"dispatch"},{"step":"schedule_followup","agent":"hunter","tool":"schedule_follow_up","depends_on":"log_activity"}]'::jsonb
),
(
  'deal_progression', 'Deal Progression', 'Closer qualifies → builds proposal/invoice → approval → dispatch or manual → outcome tracking',
  'manual', true, 3600,
  '[{"step":"closer_qualify","agent":"closer","tool":"search_knowledge","depends_on":null},{"step":"build_proposal","agent":"closer","tool":"build_proposal","depends_on":"closer_qualify"},{"step":"approval_gate","type":"human_approval","depends_on":"build_proposal"},{"step":"dispatch_proposal","agent":"closer","tool":"send_email","depends_on":"approval_gate"},{"step":"track_outcome","agent":"closer","tool":"update_lead","depends_on":"dispatch_proposal"}]'::jsonb
),
(
  'client_onboarding', 'Client Onboarding & Delivery', 'Operator creates client/project/tasks → assigns work → tracks completion → escalates blockers',
  'manual', true, 86400,
  '[{"step":"create_client","agent":"operator","tool":"create_client","depends_on":null,"requires_approval":true},{"step":"create_project","agent":"operator","tool":"create_project","depends_on":"create_client"},{"step":"create_tasks","agent":"operator","tool":"create_task","depends_on":"create_project"},{"step":"track_progress","agent":"operator","tool":"update_task","depends_on":"create_tasks"},{"step":"verify_delivery","agent":"operator","tool":"update_project","depends_on":"track_progress"}]'::jsonb
),
(
  'content_pipeline', 'Content Production & Publishing', 'Spark creates content → approval → Publisher distributes or prepares manual package',
  'manual', true, 7200,
  '[{"step":"spark_research","agent":"spark","tool":"web_search","depends_on":null},{"step":"spark_create","agent":"spark","tool":"draft_email","depends_on":"spark_research"},{"step":"approval_gate","type":"human_approval","depends_on":"spark_create"},{"step":"publisher_distribute","agent":"publisher","tool":"send_email","depends_on":"approval_gate"},{"step":"verify_publication","agent":"publisher","tool":"log_lead_activity","depends_on":"publisher_distribute"}]'::jsonb
),
(
  'business_intelligence', 'Business Intelligence Report', 'Analyst queries structured records → sourced report → THALOS prioritises actions',
  'manual', false, 1800,
  '[{"step":"analyst_query","agent":"analyst","tool":"generate_business_report","depends_on":null},{"step":"thalos_prioritise","agent":"thalos","tool":"search_knowledge","depends_on":"analyst_query"}]'::jsonb
),
(
  'knowledge_research', 'Knowledge Research', 'Researcher searches indexed knowledge + public sources → citations → states gaps',
  'manual', false, 1800,
  '[{"step":"rag_search","agent":"researcher","tool":"search_knowledge","depends_on":null},{"step":"web_supplement","agent":"researcher","tool":"web_search","depends_on":"rag_search"},{"step":"compile_findings","agent":"researcher","tool":"save_to_db","depends_on":"web_supplement"}]'::jsonb
)
ON CONFLICT (workflow_id) DO NOTHING;

-- ── Workflow Runs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_runs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id      TEXT        NOT NULL REFERENCES workflow_definitions(workflow_id),
  run_number       BIGINT      NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'draft',
  -- draft|validated|queued|running|awaiting_approval|approved|executing|verifying|completed
  -- |rejected|failed|cancelled|expired|needs_configuration|partial_success|manual_action_required|dead_letter
  trigger_type     TEXT        NOT NULL DEFAULT 'manual',
  triggered_by     TEXT        NOT NULL DEFAULT 'founder',
  input_data       JSONB       NOT NULL DEFAULT '{}',
  output_data      JSONB,
  current_step     TEXT,
  steps_completed  TEXT[]      NOT NULL DEFAULT '{}',
  steps_failed     TEXT[]      NOT NULL DEFAULT '{}',
  error_message    TEXT,
  idempotency_key  TEXT        UNIQUE,
  approval_id      UUID,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workflow_run_status_valid CHECK (status IN (
    'draft','validated','queued','running','awaiting_approval','approved','executing',
    'verifying','completed','rejected','failed','cancelled','expired',
    'needs_configuration','partial_success','manual_action_required','dead_letter'
  ))
);

CREATE UNIQUE INDEX workflow_run_number_idx ON workflow_runs(workflow_id, run_number);
CREATE INDEX workflow_runs_status_idx ON workflow_runs(status);
CREATE INDEX workflow_runs_created_at_idx ON workflow_runs(created_at DESC);

CREATE TRIGGER workflow_runs_updated_at
  BEFORE UPDATE ON workflow_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON workflow_runs USING (auth.role() = 'service_role');

-- ── Durable Job Queue ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type         TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'queued',
  -- queued|claimed|running|completed|failed|cancelled|dead_letter
  priority         INTEGER     NOT NULL DEFAULT 5, -- 1=highest, 10=lowest
  payload          JSONB       NOT NULL DEFAULT '{}',
  result           JSONB,
  error            TEXT,
  idempotency_key  TEXT        UNIQUE,
  workflow_run_id  UUID        REFERENCES workflow_runs(id),
  agent_id         TEXT,
  owner_id         TEXT        NOT NULL DEFAULT 'system',
  -- Worker lease fields
  worker_id        TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt          INTEGER     NOT NULL DEFAULT 0,
  max_attempts     INTEGER     NOT NULL DEFAULT 3,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  backoff_seconds  INTEGER     NOT NULL DEFAULT 30,
  -- Dead letter
  dead_letter_at   TIMESTAMPTZ,
  dead_letter_reason TEXT,
  -- Timing
  scheduled_for    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT job_status_valid CHECK (status IN ('queued','claimed','running','completed','failed','cancelled','dead_letter')),
  CONSTRAINT job_attempt_non_negative CHECK (attempt >= 0),
  CONSTRAINT job_max_attempts_positive CHECK (max_attempts > 0)
);

CREATE INDEX jobs_claimable_idx ON jobs(status, priority, next_attempt_at)
  WHERE status = 'queued';
CREATE INDEX jobs_lease_expiry_idx ON jobs(lease_expires_at)
  WHERE status = 'claimed';
CREATE INDEX jobs_dead_letter_idx ON jobs(dead_letter_at)
  WHERE status = 'dead_letter';
CREATE INDEX jobs_workflow_run_idx ON jobs(workflow_run_id);

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON jobs USING (auth.role() = 'service_role');

-- Atomic job claim function — FOR UPDATE SKIP LOCKED prevents double-claims
CREATE OR REPLACE FUNCTION claim_next_job(p_worker_id TEXT, p_lease_seconds INTEGER DEFAULT 300)
RETURNS SETOF jobs LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_job jobs;
BEGIN
  SELECT * INTO v_job
  FROM jobs
  WHERE status = 'queued'
    AND next_attempt_at <= now()
    AND attempt < max_attempts
  ORDER BY priority ASC, scheduled_for ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE jobs SET
    status = 'claimed',
    worker_id = p_worker_id,
    lease_expires_at = now() + (p_lease_seconds || ' seconds')::INTERVAL,
    attempt = attempt + 1,
    started_at = COALESCE(started_at, now()),
    updated_at = now()
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN NEXT v_job;
END;
$$;

-- Reclaim expired leases (called by worker on startup and periodically)
CREATE OR REPLACE FUNCTION reclaim_expired_leases()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH reclaimed AS (
    UPDATE jobs SET
      status = 'queued',
      worker_id = null,
      lease_expires_at = null,
      next_attempt_at = now() + (backoff_seconds * attempt || ' seconds')::INTERVAL,
      updated_at = now()
    WHERE status = 'claimed'
      AND lease_expires_at < now()
      AND attempt < max_attempts
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM reclaimed;
  RETURN v_count;
END;
$$;

-- Move max-attempt-exceeded jobs to dead letter
CREATE OR REPLACE FUNCTION move_to_dead_letter()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH moved AS (
    UPDATE jobs SET
      status = 'dead_letter',
      dead_letter_at = now(),
      dead_letter_reason = 'Max attempts exceeded: ' || attempt || '/' || max_attempts,
      updated_at = now()
    WHERE status IN ('queued','claimed')
      AND attempt >= max_attempts
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM moved;
  RETURN v_count;
END;
$$;
