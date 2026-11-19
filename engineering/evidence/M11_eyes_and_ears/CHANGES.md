# CHANGES LOG: S03 — Eyes & Ears (Mission 11)

## New Files
- `src/lib/safeFetch.ts`: Canonical SSRF protection and safe HTTP fetcher enforcing private network blocking, cloud metadata blocking, redirect target validation, timeouts, and max body size limits.
- `src/lib/externalContentGuard.ts`: Sanitization, instruction neutralization, and untrusted delimiter demarcation guard for external inputs.
- `tests/unit/eyesAndEars.test.ts`: Comprehensive test suite verifying S03-AC-01 through S03-AC-08 (18 unit tests).
- `engineering/evidence/M11_eyes_and_ears/*`: Mission evidence documentation pack.

## Modified Files
- `src/execution/tools/webSearch.ts`:
  - Enriched `SearchResult` with `retrieved_at` ISO 8601 timestamp and formatted `citation` string.
  - Routed outbound requests through `safeFetchModule.safeFetch`.
  - Sanitized result snippets with `sanitizeExternalText`.
- `src/execution/tools/websiteAudit.ts`:
  - Replaced inline SSRF checks with canonical `safeFetch` and `validateUrl`.
  - Sanitized extracted HTML preview text with `sanitizeExternalText`.
- `src/worker/worker.ts`:
  - Added `system_health_check` and `monitor_pipeline` to `CanonicalJobType` and `jobHandlers`.
  - Implemented `monitorPipeline` with configurable `stale_lead_days` and `limit`.
  - Implemented `systemHealthCheck` database diagnostic routine.
- `tests/security/ssrf.test.ts`:
  - Integrated canonical `validateUrl` and `safeFetch`.
  - Added tests for redirect SSRF blocking, content size limits, and external content prompt injection neutralization.
