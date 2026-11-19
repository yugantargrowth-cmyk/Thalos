# Changes — Mission L14: Runtime / Home

## Created Files
- `.nvmrc` — Explicit Node.js LTS version specification (v20.18.0).
- `.env.example` — Developer environment configuration template.
- `.github/workflows/ci.yml` — Automated CI workflow running install, lint, typecheck, test, and build.
- `src/api/app.ts` — Express application factory with Helmet, CORS, correlation IDs, health/ready endpoints, body limits, and route mounting.
- `src/api/middleware/correlationId.ts` — Correlation ID generator/extractor, response header setter, and request lifecycle logger.
- `tests/unit/config.test.ts` — Unit tests for Zod configuration schema, safe defaults, and strict production validation.
- `tests/unit/logger.test.ts` — Unit tests for Winston structured logging and secret redaction.
- `tests/api/health.test.ts` — API tests for `/health`, `/health/ready`, security headers, CORS origin enforcement, 404 handler, and body limit.
- `tests/worker/workerHealth.test.ts` — Integration tests for WorkerService health server (`/health`, `/ready`) and graceful shutdown.
- `docs/runbooks/BACKUP_AND_RESTORE.md` — Database and vault backup/restore operational runbook.
- `docs/runbooks/INCIDENT_RESPONSE.md` — Incident triage, log investigation, and escalation runbook.
- `docs/runbooks/MONITORING.md` — Health probe definitions, alerting thresholds, and metrics guide.

## Modified Files
- `src/lib/config.ts` — Added Zod schema validation, safe defaults for dev/test, strict production fail-closed validation, and `ConfigValidationError`.
- `src/lib/logger.ts` — Added Winston redaction format for sensitive keys/bearer tokens, and sanitized error messages.
- `src/api/server.ts` — Refactored to import `createApp()`, added `startServer()`, `stopServer()`, graceful shutdown signal listeners, and drain timeouts.
- `src/api/middleware/errorHandler.ts` — Injected correlation ID into error responses and logs; sanitized error messages.
- `src/worker/worker.ts` — Refactored into `WorkerService` with embedded HTTP health server, start/stop lifecycle, and graceful shutdown handlers.
- `package.json` — Updated `eslint` to `^8.57.1` to match `@typescript-eslint` v6.
- `package-lock.json` — Lockfile updated for reproducible dependencies.
- `README.md` — Reconciled test suite counts (113 tests), updated CLI commands, documented health endpoints and operational runbooks.
