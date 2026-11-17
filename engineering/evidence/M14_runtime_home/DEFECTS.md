# Defect Register — Mission L14: Runtime / Home

| Defect ID | Severity | Status | Description | Resolution / Evidence |
|---|---|---|---|---|
| R-001 | Critical | FIXED | Development secrets and PIN hash have fallback defaults that could run in production | Implemented `validateConfig()` with Zod schema and production guards in `src/lib/config.ts`; startup fails closed in production. Verified by `tests/unit/config.test.ts`. |
| R-013 | Medium | FIXED | README claims 45 tests; test suite actually contained 95 declarations and 0 CI/documentation alignment | Reconciled test documentation in `README.md`; added 18 runtime/security/health tests bringing total to 113 tests across 13 suites. All pass. |
| DEF-L14-01 | High | FIXED | ESLint 9 / @typescript-eslint v6 version mismatch caused `npm run lint` to crash with `context.getScope is not a function` | Installed compatible `eslint@^8.57.1`; aligned flat config; `npm run lint` now passes with 0 errors. |
| DEF-L14-02 | Medium | FIXED | Express server auto-executed on import in `src/api/server.ts`, preventing clean testing and lacking graceful shutdown signals | Refactored into `createApp()` (`src/api/app.ts`) and `startServer()`/`stopServer()` (`src/api/server.ts`) with `SIGTERM`/`SIGINT` handling and drain timeouts. |
| DEF-L14-03 | Medium | FIXED | Background worker had no HTTP health endpoint and no graceful stop lifecycle | Built `WorkerService` class in `src/worker/worker.ts` exposing `GET /health` and `GET /ready` on port 3001, with graceful shutdown signal handlers. |
