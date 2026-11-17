# Security Review — Mission L13: Persistence

## 1. Row-Level Security (RLS) & Access Control
- **Audit Findings:** Verified that all tables (`documents`, `document_chunks`, `knowledge_nodes`, `integrations`, `audit_log`, `jobs`, `tax_rates`) enforce Row-Level Security (`ENABLE ROW LEVEL SECURITY`).
- **Policy Enforcement:** Policies restrict direct reads and mutations to `service_role`. The public anon key cannot query or modify private operational tables.

## 2. Audit Log Immutability & Anti-Tamper Trigger
- **Enforcement:** Migration 005 enforces table-level immutability via PostgreSQL trigger `audit_log_immutable` calling `prevent_audit_mutation()`. Any attempt to execute `UPDATE` or `DELETE` against `audit_log` raises a hard PostgreSQL exception.
- **Service Role Restriction:** `audit_log` allows only `INSERT` and `SELECT` for `service_role`. Mutation from application code is mathematically forbidden by database constraints.

## 3. Ingestion Error Concealment (R-003) Fixed
- **Vulnerability Addressed:** `processIngestionJob` previously caught extraction errors, updated the document to `failed`, but swallowed the exception. The calling worker recorded the job as `completed`, concealing the failure from the queue and job telemetry.
- **Remediation Implemented:** `processIngestionJob` updates the document status to `failed` with the sanitized error message, AND rethrows the error to the worker. The worker marks the job as `failed` (or schedules an exponential backoff retry if attempts remain).
- **Verification:** Verified via `tests/unit/ingestionQueue.test.ts`.

## 4. Integrity Hashing & Deduplication
- **Implementation:** `computeSha256` generates deterministic SHA-256 hashes of all ingested files (`checksum_sha256`), preventing duplicate ingestions, tampering, and version confusion.
