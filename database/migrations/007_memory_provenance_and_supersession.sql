-- ============================================================
-- Migration 007: Memory Provenance, Scope, Confidence & Supersession Semantics
-- THALOS — Yugantar Growth Agentic AI Business OS
-- Fulfills L13-AC-06: Memory facts have provenance, scope,
-- confidence/verification and correction/supersession semantics.
-- ============================================================

ALTER TABLE knowledge_nodes
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES knowledge_nodes(id),
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_nodes_verification_status_check'
  ) THEN
    ALTER TABLE knowledge_nodes
      ADD CONSTRAINT knowledge_nodes_verification_status_check
      CHECK (verification_status IN ('unverified', 'verified', 'disputed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_nodes_status_check'
  ) THEN
    ALTER TABLE knowledge_nodes
      ADD CONSTRAINT knowledge_nodes_status_check
      CHECK (status IN ('active', 'superseded', 'deleted'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_nodes_confidence_check'
  ) THEN
    ALTER TABLE knowledge_nodes
      ADD CONSTRAINT knowledge_nodes_confidence_check
      CHECK (confidence >= 0.0 AND confidence <= 1.0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_nodes_status_idx ON knowledge_nodes(status);
CREATE INDEX IF NOT EXISTS knowledge_nodes_scope_idx ON knowledge_nodes(scope);
