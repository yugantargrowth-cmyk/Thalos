# CHANGES LOG: S02 — Memory (Mission 10)

## New Files
- `src/persistence/memoryService.ts`: Canonical Memory Service managing the durable memory lifecycle, inference gating, active deduplication, supersession, soft-deletion, verification, and scope-bounded retrieval.
- `tests/unit/memoryLifecycle.test.ts`: Comprehensive unit test suite covering S02-AC-01 through S02-AC-08 (11 tests).
- `engineering/evidence/M10_memory/*`: Evidence pack (`MISSION_REPORT.md`, `ACCEPTANCE_MATRIX.md`, `TEST_RESULTS.md`, `SECURITY_REVIEW.md`, `DEFECTS.md`, `CHANGES.md`).

## Modified Files
- `src/intelligence/contextAssembler.ts`: Added `relevantMemories` and `scopeFilter` parameters, memory text formatting, source attribution, and strict scope boundary filtering.
- `src/persistence/ragSearch.ts`: Added formatted `citation` field and fusion method metadata to `SearchResult` interface and RRF fusion output.
- `src/persistence/ingestionQueue.ts`: Added SHA-256 checksum deduplication to skip redundant vector embedding on duplicate documents, and automatic supersession of `previous_version_id` documents upon successful indexing.
- `tests/unit/ingestionQueue.test.ts`: Added mock for `documentRepository.getByChecksum` in negative error propagation test.
