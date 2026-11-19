# Changes — Mission L13: Persistence

## Created Files
- `database/migrations/007_memory_provenance_and_supersession.sql` — Schema migration adding confidence, verification_status, status, superseded_by, and scope columns with check constraints to `knowledge_nodes`.
- `src/persistence/repositories/documentRepository.ts` — Typed repository for documents and document chunks.
- `src/persistence/repositories/knowledgeRepository.ts` — Typed repository for knowledge nodes with provenance, scope, verification, and supersession logic.
- `src/persistence/repositories/auditRepository.ts` — Typed repository for append-only audit logging and filtering.
- `src/persistence/repositories/jobRepository.ts` — Typed repository for job lifecycle transitions and leases.
- `src/persistence/repositories/index.ts` — Central repository barrel export.
- `tests/unit/migrations.test.ts` — Automated tests validating all migrations 001–007, checksum integrity, RLS policies, and immutability triggers.
- `tests/unit/ingestionQueue.test.ts` — Automated tests for SHA-256 computation, MIME extraction, chunking, and R-003 error propagation.
- `tests/unit/ragSearch.test.ts` — Automated tests for Reciprocal Rank Fusion ranking math and candidate sorting.
- `tests/unit/repositories.test.ts` — Automated tests for repository interfaces, provenance, and supersession semantics.

## Modified Files
- `scripts/migrate.js` — Added migration plan generator, sha256 checksum tracking, and `_schema_migrations` tracking table support.
- `src/persistence/ingestionQueue.ts` — Fixed R-003: updated `processIngestionJob` to update document status AND rethrow error to worker; integrated `documentRepository` and SHA-256 buffer hashing.
- `src/persistence/ragSearch.ts` — Upgraded hybrid search from constant scoring to Reciprocal Rank Fusion (RRF, k=60); enriched return metadata with individual rank breakdowns.
