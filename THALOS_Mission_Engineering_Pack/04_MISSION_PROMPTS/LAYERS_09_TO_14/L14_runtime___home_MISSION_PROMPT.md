# MISSION L14 — RUNTIME / HOME

**Mission type:** Technical backend layer  
**Status:** Execute only when selected in `MISSION_EXECUTION_ORDER.md`.

## Mission objective

Complete the application runtime foundation for secure, repeatable localhost operation and later production readiness.

## Ownership and dependencies

**Primary dependencies:** All other technical layers.

**Scope boundary:** Do not introduce microservices, container orchestration or paid infrastructure unless justified and approved. Localhost-first remains locked.

Use `02_ARCHITECTURE/CANONICAL_OWNERSHIP_MAP.md` to resolve code ownership. If this mission requires changing a primitive owned by another layer, coordinate through that owner; do not create a duplicate.

## Acceptance criteria

- [ ] **L14-AC-01:** Node/runtime version and dependency constraints are explicit and reproducible.
- [ ] **L14-AC-02:** Configuration has validated schemas, safe defaults and strict production guards.
- [ ] **L14-AC-03:** API and worker start/stop cleanly and expose health/readiness endpoints.
- [ ] **L14-AC-04:** Structured logs, correlation IDs, error handling and secret redaction are consistent.
- [ ] **L14-AC-05:** CORS, security headers, rate limits, body/file limits and graceful shutdown are configured.
- [ ] **L14-AC-06:** Local development setup, migration and seed procedures are repeatable and documented.
- [ ] **L14-AC-07:** CI checks cover install, lint, typecheck, tests and build.
- [ ] **L14-AC-08:** Backup, restore, monitoring and incident runbooks are documented and tested where possible.
- [ ] **L14-AC-09:** No production deployment occurs in this mission.

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
