# Repository Baseline — Uploaded `Thalos-main.zip`

**Snapshot archive:** `Thalos-main.zip`  
**Archive root:** `Thalos-main/`  
**Archive file timestamps:** 12 November 2026  
**Audit context date:** 18 November 2026  
**Scope:** Static inspection of the uploaded archive. No dependency installation, live database migration, provider connection, build or test run is claimed.

## Observed structure

- Node.js 20+ / TypeScript ESM.
- Express API.
- Supabase JavaScript client and PostgreSQL migrations.
- Six migration files: `001_extensions_and_config.sql` through `006_vector_index.sql`.
- Nine API route files: auth, approvals, clients, finance, integrations, intelligence, knowledge, leads and system.
- Intelligence modules: orchestrator, LLM client, tool registry and brief.
- Execution modules: dispatcher, approval executor and tool handlers.
- Persistence modules: RAG search and ingestion queue.
- Worker: `src/worker/worker.ts`.
- Business proposal PDF builder.
- Single `public/index.html` frontend (approximately 72 KB).
- Nine seeded agents in migration 002.
- 25 seeded tool definitions in migration 002.
- Seven seeded workflow definitions in migration 002.
- Nine test source files.
- Static grep found 95 `it()` / `test()` declarations. These were not executed.
- No `node_modules` directory was present in the archive.

## Important documentation mismatch

`README.md` states “All 45 tests”; static source inspection found 95 test declarations. Reconcile this by running the actual test suite and updating the README to report real, reproducible results. Do not assume all 95 are meaningful or passing.

## Initial risk observations to revalidate

1. `src/lib/config.ts` includes development fallback values for Supabase URL/key, JWT secret, owner PIN hash and encryption key. Add strict production validation and fail-closed startup behavior. Confirm whether these defaults can be used in any deployed mode.
2. `src/intelligence/orchestrator.ts` contains a Groq-native tool-call loop with a fixed Groq model. The general LLM client may have fallback behavior, but equivalent native tool calling across providers was not established by static inspection.
3. `src/execution/toolDispatcher.ts` maps `social_lookup` to the website audit handler. Verify whether this is intentionally a constrained URL checker or a misleading capability label.
4. `n8n_trigger` is intentionally seeded as `needs_configuration` and n8n is explicitly not part of the initial architecture. Do not implement it just to reach a numeric handler count.
5. `sheets_import` is mapped to a reporting handler. Verify that its queued job type is actually handled by the worker.
6. `save_to_db` has no explicit input schema visible in the tool registry. Add schema validation if confirmed.
7. `src/persistence/ingestionQueue.ts` catches processing errors. Verify whether the worker can incorrectly mark a failed ingestion job as completed.
8. `ingest_knowledge_file` tool payload and worker payload contracts require verification.
9. `worker.maxConcurrency` is configured in `src/lib/config.ts`; verify whether the worker actually honors it.
10. Approval state transitions and execution must be atomic and idempotent. Inspect route, DB constraints and executor together.
11. The frontend is a single large HTML file. Static inspection identified references to `rejectAction()`, `refreshApprovalsList()` and `loadPipelineStats()` that must be verified against actual definitions and browser behavior.
12. Frontend metrics and agent statuses must come from real API/DB data, never fabricated fallback values.
13. Frontend insertion of untrusted data through `innerHTML` requires XSS review and safe rendering.
14. SSRF protection must cover DNS resolution, IP ranges, redirects and rebinding, not just hostname strings.
15. The repository has test files but no proof of successful build, live DB migrations, real integration tests or E2E tests in the supplied archive.

## Baseline limitations

This file records static observations, not verified runtime defects. Antigravity must re-check each item against the current working tree and classify it as:
- Confirmed defect.
- Existing and fixed since snapshot.
- Intentional behavior.
- False positive.
- Unverified due to missing environment.

Do not copy these observations into a final report as proven defects without revalidation.
