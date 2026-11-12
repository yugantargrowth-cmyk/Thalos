-- ============================================================
-- Migration 004: Finance — Proposals, Invoices, Payment Ledger
-- DISCLAIMER: Tax calculations are for internal reference only.
-- Always consult a qualified CA for GST/tax compliance.
-- ============================================================

-- ── Proposals ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposals (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID          REFERENCES leads(id),
  client_id       UUID          REFERENCES clients(id),
  client_name     TEXT          NOT NULL,
  client_email    TEXT,
  line_items      JSONB         NOT NULL DEFAULT '[]',
  -- [{description, quantity, unit_price, subtotal}]
  custom_scope    TEXT,
  subtotal        NUMERIC(12,2) NOT NULL,
  tax_rate_id     UUID          REFERENCES tax_rates(id),
  tax_percent     NUMERIC(6,4)  NOT NULL DEFAULT 18.0000,
  tax_amount      NUMERIC(12,2) NOT NULL,
  total           NUMERIC(12,2) NOT NULL,
  valid_until     DATE,
  status          TEXT          NOT NULL DEFAULT 'draft',
  -- draft|approved|sent|accepted|rejected|invoiced|expired
  sent_at         TIMESTAMPTZ,
  sent_via        TEXT,         -- email|manual|whatsapp
  sent_evidence   TEXT,         -- provider message ID or 'manual_handoff'
  accepted_at     TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,
  rejection_note  TEXT,
  approval_id     UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- Integrity: total must equal subtotal + tax_amount (enforced server-side, checked here)
  CONSTRAINT proposal_total_check CHECK (
    ABS(total - (subtotal + tax_amount)) < 0.02
  ),
  CONSTRAINT proposal_amounts_non_neg CHECK (
    subtotal >= 0 AND tax_amount >= 0 AND total >= 0
  ),
  CONSTRAINT proposal_status_valid CHECK (status IN (
    'draft','approved','sent','accepted','rejected','invoiced','expired'
  ))
);

CREATE INDEX proposals_lead_idx ON proposals(lead_id);
CREATE INDEX proposals_client_idx ON proposals(client_id);
CREATE INDEX proposals_status_idx ON proposals(status);

CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON proposals USING (auth.role() = 'service_role');

-- ── Invoice Number Sequence ───────────────────────────────────
-- Sequential YG-YYYY-NNN format, year-scoped
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_year  TEXT := EXTRACT(YEAR FROM now())::TEXT;
  v_seq   BIGINT;
  v_count BIGINT;
BEGIN
  -- Use count of invoices this year for a simple sequential number
  SELECT COUNT(*) + 1 INTO v_count
  FROM invoices
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now());

  RETURN 'YG-' || v_year || '-' || LPAD(v_count::TEXT, 3, '0');
END;
$$;

-- ── Invoices ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT          NOT NULL UNIQUE,
  client_id       UUID          REFERENCES clients(id),
  proposal_id     UUID          REFERENCES proposals(id),
  client_name     TEXT          NOT NULL,
  client_email    TEXT,
  line_items      JSONB         NOT NULL DEFAULT '[]',
  subtotal        NUMERIC(12,2) NOT NULL,
  tax_rate_id     UUID          REFERENCES tax_rates(id),
  tax_percent     NUMERIC(6,4)  NOT NULL DEFAULT 18.0000,
  tax_amount      NUMERIC(12,2) NOT NULL,
  total           NUMERIC(12,2) NOT NULL,
  balance_due     NUMERIC(12,2) NOT NULL,
  due_date        DATE          NOT NULL,
  status          TEXT          NOT NULL DEFAULT 'draft',
  -- draft|approved|sent|partially_paid|paid|overdue|cancelled|void
  sent_at         TIMESTAMPTZ,
  sent_via        TEXT,
  sent_evidence   TEXT,
  approval_id     UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT invoice_total_check CHECK (
    ABS(total - (subtotal + tax_amount)) < 0.02
  ),
  CONSTRAINT invoice_amounts_non_neg CHECK (
    subtotal >= 0 AND tax_amount >= 0 AND total >= 0 AND balance_due >= 0
  ),
  CONSTRAINT invoice_status_valid CHECK (status IN (
    'draft','approved','sent','partially_paid','paid','overdue','cancelled','void'
  ))
);

CREATE INDEX invoices_client_idx ON invoices(client_id);
CREATE INDEX invoices_status_idx ON invoices(status);
CREATE INDEX invoices_due_date_idx ON invoices(due_date);

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON invoices USING (auth.role() = 'service_role');

-- ── Payment Ledger (normalised — not hidden in invoice JSONB) ─
CREATE TABLE IF NOT EXISTS payments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID          NOT NULL REFERENCES invoices(id),
  amount           NUMERIC(12,2) NOT NULL,
  payment_date     DATE          NOT NULL,
  payment_method   TEXT          NOT NULL DEFAULT 'bank_transfer',
  -- bank_transfer|upi|cash|cheque|online|other
  reference        TEXT,         -- UTR, UPI ref, cheque number etc.
  notes            TEXT,
  recorded_by      TEXT          NOT NULL DEFAULT 'founder',
  -- Who confirmed this payment: 'founder' or agent_id
  -- Payment is ONLY recorded by explicit founder confirmation or verified evidence
  evidence_type    TEXT          NOT NULL DEFAULT 'manual_entry',
  -- manual_entry|bank_statement|payment_gateway_webhook
  evidence_ref     TEXT,         -- Link to evidence if available
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT payment_amount_positive CHECK (amount > 0)
);
-- Payments are immutable: no UPDATE or DELETE allowed
-- Corrections are done by voiding the invoice and re-raising

CREATE INDEX payments_invoice_idx ON payments(invoice_id);
CREATE INDEX payments_date_idx ON payments(payment_date DESC);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON payments USING (auth.role() = 'service_role');

-- Auto-update invoice balance_due and status after payment insert
CREATE OR REPLACE FUNCTION update_invoice_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_paid NUMERIC(12,2);
  v_total      NUMERIC(12,2);
  v_new_status TEXT;
BEGIN
  SELECT SUM(amount) INTO v_total_paid
  FROM payments WHERE invoice_id = NEW.invoice_id;

  SELECT total INTO v_total FROM invoices WHERE id = NEW.invoice_id;

  IF v_total_paid >= v_total THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partially_paid';
  ELSE
    v_new_status := 'sent';
  END IF;

  UPDATE invoices SET
    balance_due = GREATEST(0, v_total - v_total_paid),
    status = v_new_status,
    updated_at = now()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_update_invoice_balance
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_balance();

-- ── Approval Queue ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_queue (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status               TEXT        NOT NULL DEFAULT 'pending',
  -- pending|approved|rejected|completed|failed|expired
  action               TEXT        NOT NULL,  -- Human-readable: "Send WhatsApp to Priya Clinic"
  agent                TEXT        NOT NULL,
  target_name          TEXT        NOT NULL,
  target_entity_type   TEXT,       -- lead|client|proposal|invoice|content
  target_entity_id     UUID,
  payload              JSONB       NOT NULL,  -- Full content being approved
  payload_hash         TEXT        NOT NULL,  -- SHA-256 of payload — IMMUTABLE after creation
  preview_html         TEXT,
  workflow_run_id      UUID        REFERENCES workflow_runs(id),
  rejection_reason     TEXT,
  expires_at           TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at          TIMESTAMPTZ,
  reviewed_by          TEXT,
  executed_at          TIMESTAMPTZ,
  execution_result     TEXT,
  execution_evidence   TEXT,       -- Provider message ID, URL, or 'manual_handoff'
  CONSTRAINT approval_status_valid CHECK (status IN (
    'pending','approved','rejected','completed','failed','expired'
  ))
);
-- payload_hash is IMMUTABLE: any edit to payload invalidates approval and requires new record
-- This is enforced in backend code: approval cannot be re-approved after payload change

CREATE INDEX approval_queue_status_idx ON approval_queue(status, created_at DESC);
CREATE INDEX approval_queue_entity_idx ON approval_queue(target_entity_type, target_entity_id);

ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON approval_queue USING (auth.role() = 'service_role');

-- Expire pending approvals past their expiry date
CREATE OR REPLACE FUNCTION expire_approvals()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE approval_queue SET status = 'expired', updated_at = now()
    WHERE status = 'pending' AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$$;
