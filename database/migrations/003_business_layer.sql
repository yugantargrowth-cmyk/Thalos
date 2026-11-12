-- ============================================================
-- Migration 003: Business Layer — Leads, Clients, Projects, Tasks
-- ============================================================

-- ── Leads ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,                   -- Business name
  contact_name       TEXT,                                   -- Primary contact
  phone              TEXT        NOT NULL,                   -- Normalised +91XXXXXXXXXX
  email              TEXT,
  source             TEXT        NOT NULL DEFAULT 'manual',  -- google_maps|referral|inbound|manual|import|scout
  stage              TEXT        NOT NULL DEFAULT 'new',
  -- new|researching|outreach_drafted|contacted|follow_up|qualified|proposal_sent|negotiating|won|lost|unqualified
  industry           TEXT,
  location           TEXT,                                   -- Area in Ahmedabad/Gujarat
  website            TEXT,
  verified_claims    JSONB       NOT NULL DEFAULT '{}',      -- Researcher output with sources
  research_status    TEXT        NOT NULL DEFAULT 'pending', -- pending|in_progress|completed|failed
  notes              TEXT,
  next_action        TEXT,
  follow_up_date     DATE,
  assigned_agent     TEXT,
  score              INTEGER,                                -- Analyst score 0-100
  score_reasons      JSONB       NOT NULL DEFAULT '[]',      -- [{reason, weight, source}]
  last_contacted_at  TIMESTAMPTZ,
  tags               TEXT[]      NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone),
  CONSTRAINT lead_stage_valid CHECK (stage IN (
    'new','researching','outreach_drafted','contacted','follow_up',
    'qualified','proposal_sent','negotiating','won','lost','unqualified'
  )),
  CONSTRAINT lead_research_status_valid CHECK (research_status IN ('pending','in_progress','completed','failed')),
  CONSTRAINT lead_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 100))
);

CREATE INDEX leads_stage_idx ON leads(stage);
CREATE INDEX leads_follow_up_idx ON leads(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX leads_source_idx ON leads(source);
CREATE INDEX leads_created_at_idx ON leads(created_at DESC);
-- Full-text search
CREATE INDEX leads_fts_idx ON leads
  USING gin(to_tsvector('english', name || ' ' || COALESCE(contact_name,'') || ' ' || COALESCE(location,'') || ' ' || COALESCE(industry,'')));

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON leads USING (auth.role() = 'service_role');

-- ── Lead Activities ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_activities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity    TEXT        NOT NULL, -- contacted|drafted|researched|followed_up|note|stage_change|approval_sent
  description TEXT        NOT NULL,
  agent       TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Append-only: no UPDATE or DELETE
CREATE INDEX lead_activities_lead_idx ON lead_activities(lead_id, created_at DESC);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON lead_activities USING (auth.role() = 'service_role');

-- ── Follow-ups ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_ups (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      TEXT        NOT NULL, -- lead|client|task|project
  entity_id        UUID        NOT NULL,
  due_date         DATE        NOT NULL,
  due_time         TIME,
  reminder_note    TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending', -- pending|completed|cancelled|overdue
  assigned_agent   TEXT,
  notification_sent BOOLEAN    NOT NULL DEFAULT false,
  -- NOTE: notification_sent=true means a notification was attempted, NOT confirmed delivered
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT follow_up_status_valid CHECK (status IN ('pending','completed','cancelled','overdue'))
);

CREATE INDEX follow_ups_due_idx ON follow_ups(due_date, status) WHERE status = 'pending';
CREATE INDEX follow_ups_entity_idx ON follow_ups(entity_type, entity_id);

CREATE TRIGGER follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON follow_ups USING (auth.role() = 'service_role');

-- ── Clients ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name          TEXT        NOT NULL,
  contact_name           TEXT        NOT NULL,
  phone                  TEXT        NOT NULL UNIQUE,
  email                  TEXT,
  packages               JSONB       NOT NULL DEFAULT '[]', -- [{name, monthly_value, started_at}]
  monthly_value          NUMERIC(12,2) NOT NULL DEFAULT 0,
  start_date             DATE        NOT NULL,
  status                 TEXT        NOT NULL DEFAULT 'active', -- active|paused|churned|onboarding
  deliverable_tracker    JSONB       NOT NULL DEFAULT '{}',
  notes                  TEXT,
  converted_from_lead_id UUID        REFERENCES leads(id),
  tags                   TEXT[]      NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_status_valid CHECK (status IN ('active','paused','churned','onboarding')),
  CONSTRAINT client_monthly_value_non_neg CHECK (monthly_value >= 0)
);

CREATE INDEX clients_status_idx ON clients(status);
CREATE INDEX clients_fts_idx ON clients
  USING gin(to_tsvector('english', business_name || ' ' || contact_name));

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON clients USING (auth.role() = 'service_role');

-- ── Projects ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES clients(id),
  name            TEXT        NOT NULL,
  description     TEXT,
  status          TEXT        NOT NULL DEFAULT 'planning',
  -- planning|active|on_hold|completed|cancelled
  start_date      DATE,
  due_date        DATE,
  completed_date  DATE,
  milestones      JSONB       NOT NULL DEFAULT '[]',
  deliverables    JSONB       NOT NULL DEFAULT '[]',
  blockers        JSONB       NOT NULL DEFAULT '[]',
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_status_valid CHECK (status IN ('planning','active','on_hold','completed','cancelled'))
);

CREATE INDEX projects_client_idx ON projects(client_id);
CREATE INDEX projects_status_idx ON projects(status);
CREATE INDEX projects_due_date_idx ON projects(due_date) WHERE due_date IS NOT NULL;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON projects USING (auth.role() = 'service_role');

-- ── Tasks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        REFERENCES projects(id),
  parent_task_id   UUID        REFERENCES tasks(id),
  title            TEXT        NOT NULL,
  description      TEXT,
  status           TEXT        NOT NULL DEFAULT 'todo',
  -- todo|in_progress|blocked|review|completed|cancelled
  priority         TEXT        NOT NULL DEFAULT 'medium', -- low|medium|high|critical
  assigned_to      TEXT,       -- agent_id or 'founder'
  due_date         DATE,
  completed_date   DATE,
  acceptance_criteria TEXT,
  evidence         TEXT,       -- Proof of completion
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_status_valid CHECK (status IN ('todo','in_progress','blocked','review','completed','cancelled')),
  CONSTRAINT task_priority_valid CHECK (priority IN ('low','medium','high','critical'))
);

CREATE INDEX tasks_project_idx ON tasks(project_id);
CREATE INDEX tasks_status_idx ON tasks(status);
CREATE INDEX tasks_due_date_idx ON tasks(due_date) WHERE due_date IS NOT NULL;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON tasks USING (auth.role() = 'service_role');
