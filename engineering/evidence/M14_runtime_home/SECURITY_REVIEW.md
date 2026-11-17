# Security Review — Mission L14: Runtime / Home

## 1. Production Secrets and Safe Defaults (R-001)
- **Vulnerability Addressed:** Development fallback defaults (e.g. Supabase placeholder URL/key, default JWT secret, PIN 1234 bcrypt hash, static 32-byte hex master key) were previously allowed to run in production without error.
- **Remediation Implemented:** In `src/lib/config.ts`, `validateConfig()` executes Zod validation and enforces strict production guards. If `nodeEnv === 'production'`, startup immediately aborts (fail-closed) with `ConfigValidationError` if any secret matches the development default or placeholder value.
- **Verification:** Verified via `tests/unit/config.test.ts` (strictly rejects defaults in production; succeeds when genuine non-placeholder secrets are provided).

## 2. Structured Logging & Secret Redaction
- **Vulnerability Addressed:** Accidental leakage of API keys, bearer tokens, passwords, PINs, or private keys into stdout/log aggregators.
- **Remediation Implemented:** Winston logging pipeline in `src/lib/logger.ts` includes recursive deep redaction (`redactSensitiveData`) for sensitive keys (`password`, `token`, `secret`, `key`, `apiKey`, `pin`, `authorization`, `masterKey`, `jwtSecret`) and string pattern replacement for `Bearer <token>` in strings and errors.
- **Verification:** Verified via `tests/unit/logger.test.ts`.

## 3. Request Correlation & Audit Traceability
- **Implementation:** `src/api/middleware/correlationId.ts` extracts or generates an immutable UUIDv4 correlation ID for every incoming request, returning it via `x-correlation-id` and `x-request-id` headers. All error responses include `correlationId` to ensure customer-reported errors can be directly correlated to sanitized server logs.
- **Verification:** Verified via `tests/api/health.test.ts`.

## 4. Security Headers & CORS
- **Implementation:** Helmet configured in `src/api/app.ts` providing `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and explicit Content Security Policy. CORS rejects requests from unauthorized origins with HTTP 403.
- **Verification:** Verified via `tests/api/health.test.ts`.
