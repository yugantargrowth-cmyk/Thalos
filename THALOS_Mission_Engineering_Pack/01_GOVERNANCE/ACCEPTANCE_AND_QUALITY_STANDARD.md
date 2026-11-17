# Acceptance & Quality Standard

## Status vocabulary

- `PASS`: criterion verified with direct evidence.
- `FAIL`: criterion tested and failed.
- `BLOCKED`: verification/implementation cannot proceed because of a concrete external dependency or required founder decision.
- `NOT VERIFIED`: no adequate test/evidence exists.
- `NOT APPLICABLE`: demonstrably outside mission scope, with reason.

Do not convert BLOCKED or NOT VERIFIED into PASS.

## Test levels

1. Static inspection / lint.
2. Typecheck / build.
3. Unit tests.
4. Integration tests using real application modules and a disposable local DB where possible.
5. API contract tests.
6. Worker/job tests.
7. Browser/UI tests.
8. E2E business scenario tests.
9. Live provider tests, only when valid credentials and network access exist.
10. Security, performance, backup and recovery tests.

## Minimum engineering quality

- No TypeScript compile errors.
- No lint errors in changed code.
- All relevant tests pass.
- No unexplained test skips.
- No known critical/high severity defect in mission scope.
- Input validation at all untrusted boundaries.
- Explicit errors and structured logs.
- Correct timeout/retry/idempotency semantics.
- Atomic state transitions for approvals and financial/job operations.
- No secrets in source, logs, screenshots or test artifacts.
- API/DB/frontend/worker contracts aligned.
- No fabricated data in user-visible metrics.
- Accessibility and responsive behavior for changed UI.
- Migration safety and rollback/forward-repair plan.
- Documentation updated.

## Definition of 100%

A mission can be 100% only if every applicable acceptance criterion is PASS, every test/evidence requirement is met, all critical/high defects in scope are fixed, and no unknown state is represented as success.

If live verification is blocked by missing credentials or infrastructure, mission status is BLOCKED or the affected live criterion is NOT VERIFIED. It is not 100%.
