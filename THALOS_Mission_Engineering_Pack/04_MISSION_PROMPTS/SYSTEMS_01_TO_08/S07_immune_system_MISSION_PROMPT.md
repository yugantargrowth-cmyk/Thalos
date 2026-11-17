# MISSION S07 — IMMUNE SYSTEM

**Mission type:** Conceptual system  
**Status:** Execute only when selected in `MISSION_EXECUTION_ORDER.md`.

## Mission objective

Enforce authentication, authorization, approvals, validation, audit and security policies across every application boundary.

## Ownership and dependencies

**Primary dependencies:** L11 Execution, L13 Persistence, L14 Runtime.

**Scope boundary:** Do not rely on frontend-only approval gates. Do not weaken security to make a test pass. Do not expose service-role credentials.

Use `02_ARCHITECTURE/CANONICAL_OWNERSHIP_MAP.md` to resolve code ownership. If this mission requires changing a primitive owned by another layer, coordinate through that owner; do not create a duplicate.

## Acceptance criteria

- [ ] **S07-AC-01:** Production startup rejects default/weak/missing secrets and unsafe configuration.
- [ ] **S07-AC-02:** Authentication, session/token expiry, rate limiting, CORS, CSRF and security headers are configured correctly for the actual auth model.
- [ ] **S07-AC-03:** Agent and tool permissions are enforced server-side and follow least privilege.
- [ ] **S07-AC-04:** Approval policy is immutable for the specific pending action and validated again at execution.
- [ ] **S07-AC-05:** Approval state transitions are atomic, single-use, expiry-aware and race-safe.
- [ ] **S07-AC-06:** Sensitive side effects require explicit founder approval and are audit logged.
- [ ] **S07-AC-07:** Audit events are append-only and do not leak credentials or sensitive payloads.
- [ ] **S07-AC-08:** SSRF, XSS, injection, file upload, path traversal, secret leakage and privilege escalation tests pass.
- [ ] **S07-AC-09:** Security regression tests cover every confirmed high/critical issue.

## Global rules
Follow `00_START_HERE/MASTER_CRISP_PROMPT.md`, the product charter, architecture ownership map, acceptance standard and security policy. Revalidate the repository; do not assume baseline findings are still true. Preserve user changes. Work on one mission only. Do not claim success without direct evidence. No destructive operations, external messages, financial side effects, credential rotation or public deployment without explicit approval.

## Required workflow
1. Inspect repository and dependencies.
2. Produce a current-state map and acceptance checklist.
3. Identify exact code ownership and cross-mission dependencies.
4. Plan the smallest safe implementation.
5. Implement, lint, typecheck, test, integrate, security-check and regression-test.
6. Repeat bounded repair cycles; after three failed attempts at one root cause, stop and escalate rather than loop pointlessly.
7. Capture reproducible evidence.
8. Write mission report using `05_EVIDENCE_TEMPLATES/`.
9. Mark each criterion PASS / FAIL / BLOCKED / NOT VERIFIED / NOT APPLICABLE.
10. Declare PASS only when all applicable criteria are proven.

## Required evidence directory
`engineering/evidence/{mid}_{slug}/`

Include `MISSION_REPORT.md`, `ACCEPTANCE_MATRIX.md`, `TEST_RESULTS.md`, `DEFECTS.md`, `CHANGES.md`, relevant security/API/DB/runtime evidence, raw logs, screenshots where UI is relevant, and reproducible commands.

## Completion gate
Do not start another mission until this mission is PASS or the founder explicitly authorizes proceeding with a documented dependency blocker. Missing credentials or infrastructure must be reported as BLOCKED / NOT VERIFIED, never silently mocked as live success.

## Mission-specific verification guidance

- Trace the complete user-visible flow to the persisted result and evidence, not merely the UI/API entry point.
- Add negative tests for invalid inputs, missing permissions, provider failures, timeouts and partial failures.
- Add concurrency/retry/restart tests wherever state or side effects may be repeated.
- Verify that failure states remain visible and are not reported as success.
- Ensure the tests exercise the actual application code; avoid tests that duplicate implementation logic in mocks.
