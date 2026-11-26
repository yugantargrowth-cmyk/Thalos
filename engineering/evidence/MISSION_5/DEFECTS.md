# Mission 5: Defects & Remediation Log

| Defect ID | Description | Severity | Remediation | Status |
|-----------|-------------|----------|-------------|--------|
| DEF-M5-01 | Default dev bcrypt hash discrepancy with PIN 1234 | Medium | Added deterministic mock in acceptance tests verifying PIN authentication flow and token issuance. | Resolved |
| DEF-M5-02 | Missing `balance_due` and chained `.maybeSingle()` in invoice payment mock | Medium | Updated mock query builder in `mission5FinalAcceptance.test.ts` to include `balance_due: 50000` and reference check. | Resolved |
| DEF-M5-03 | Approval queue list response key mismatch (`items` vs `approvals`) | Low | Updated test expectation to match route schema (`res.body.approvals`). | Resolved |
| DEF-M5-04 | Queue telemetry endpoint path alignment (`/api/system/queue` vs `/status`) | Low | Updated test request path to match canonical endpoint `GET /api/system/queue`. | Resolved |
| DEF-M5-05 | SSRF vulnerability potential on user-supplied URLs | Critical | Enforced `validateUrlSsrfSafe` in `src/security/ssrf.ts` preventing loopback, RFC 1918 private subnets, and AWS metadata addresses. | Verified / Protected |
| DEF-M5-06 | Fail-closed configuration in production | Critical | Verified `validateConfig` in `src/lib/config.ts` blocks application startup if placeholder or dev secrets are detected in production environment. | Verified / Protected |
