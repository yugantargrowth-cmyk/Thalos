# MISSION E15 — END-TO-END INTEGRATION & VERIFICATION

**Mission type:** Final integration  
**Status:** Execute only when selected in `MISSION_EXECUTION_ORDER.md`.

## Mission objective

Prove that the completed THALOS application works as one secure, integrated, recoverable system and produce the final evidence-backed acceptance report.

## Ownership and dependencies

**Primary dependencies:** All 8 conceptual systems and 6 technical layers.

**Scope boundary:** Do not deploy to production, send real customer messages, issue real invoices, record real payments or use real customer data without explicit approval.

Use `02_ARCHITECTURE/CANONICAL_OWNERSHIP_MAP.md` to resolve code ownership. If this mission requires changing a primitive owned by another layer, coordinate through that owner; do not create a duplicate.

## Acceptance criteria

- [ ] **E15-AC-01:** All 14 prior mission reports and acceptance matrices are present; blocked items are explicitly listed.
- [ ] **E15-AC-02:** Clean local setup from documented instructions succeeds in a fresh working directory/environment.
- [ ] **E15-AC-03:** Database migrations apply in order to a disposable database and schema verification passes.
- [ ] **E15-AC-04:** API and worker start, health checks pass, and graceful shutdown works.
- [ ] **E15-AC-05:** Founder login, token/session lifecycle and permissions work.
- [ ] **E15-AC-06:** All nine agents load with correct roles, tools and permission scopes.
- [ ] **E15-AC-07:** All enabled tools have valid schemas, registered handlers and tested behavior.
- [ ] **E15-AC-08:** Approval-required actions cannot execute before approval; approval is atomic, single-use and evidenced.
- [ ] **E15-AC-09:** Memory/RAG ingestion, retrieval, source attribution, correction and failure states work.
- [ ] **E15-AC-10:** At least one complete business scenario spans research → lead/CRM → client/project/task → proposal/document → approval → reporting, using test data only.
- [ ] **E15-AC-11:** A background workflow survives worker restart and does not duplicate side effects.
- [ ] **E15-AC-12:** Frontend Core → Environments → Workspaces works on desktop and mobile; no dead controls or fabricated metrics.
- [ ] **E15-AC-13:** Integration settings mask credentials and perform real connection tests when credentials are available.
- [ ] **E15-AC-14:** Security checks cover auth, authorization, approvals, XSS, SSRF, upload validation, secret leakage and rate limiting.
- [ ] **E15-AC-15:** Performance smoke tests and worker concurrency tests meet documented local thresholds.
- [ ] **E15-AC-16:** Backup and restore are demonstrated against disposable test data.
- [ ] **E15-AC-17:** All critical/high defects are closed; remaining medium/low issues are listed and approved or explicitly out of scope.
- [ ] **E15-AC-18:** Final evidence index, architecture map, runbook, known limitations and readiness verdict are delivered.

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
