# Defect Register — Mission L13: Persistence

| Defect ID | Severity | Status | Description | Resolution / Evidence |
|---|---|---|---|---|
| R-003 | Critical | FIXED | Ingestion error swallowed in `processIngestionJob`; worker falsely marked job as completed while document was marked failed | `processIngestionJob` in `src/persistence/ingestionQueue.ts` rethrows error so worker properly registers failure and schedules retry or dead-letter. Verified by `tests/unit/ingestionQueue.test.ts`. |
| DEF-L13-01 | Medium | FIXED | Migrations runner lacked tracking table, risking repeated execution or untracked manual schema edits | Added `_schema_migrations` tracking table to `scripts/migrate.js` recording version, filename, sha256 checksum, and applied timestamp. |
| DEF-L13-02 | Medium | FIXED | `knowledge_nodes` lacked explicit fields for confidence, verification status, supersession link, and scope (L13-AC-06) | Created migration `007_memory_provenance_and_supersession.sql` adding `confidence`, `verification_status`, `superseded_by`, `scope`, and check constraints. |
| DEF-L13-03 | Low | FIXED | RAG hybrid search used arbitrary constant scoring for FTS without true fusion math | Implemented Reciprocal Rank Fusion (RRF with k=60) in `src/persistence/ragSearch.ts`, providing principled fusion ranking between FTS and Vector search. |
