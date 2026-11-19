# MISSION S08 — BODY & HOME

**Mission type:** Conceptual system  
**Status:** Execute only when selected in `MISSION_EXECUTION_ORDER.md`.

## Mission objective

Deliver the integrated THALOS product shell: local runtime, adaptive frontend, environments/workspaces, settings, health and recovery experience.

## Ownership and dependencies

**Primary dependencies:** L14 Runtime, L12 Business, L09 Intelligence, L11 Execution.

**Scope boundary:** Do not create separate desktop/mobile products. Do not invent live/online status or metrics. Production deployment remains out of scope.

Use `02_ARCHITECTURE/CANONICAL_OWNERSHIP_MAP.md` to resolve code ownership. If this mission requires changing a primitive owned by another layer, coordinate through that owner; do not create a duplicate.

## Acceptance criteria

- [ ] **S08-AC-01:** The application starts locally through documented, repeatable commands with API and worker health checks.
- [ ] **S08-AC-02:** The frontend uses Core → Environments → Workspaces and provides the agreed immersive companion/control-centre experience.
- [ ] **S08-AC-03:** One adaptive PWA supports desktop and mobile; landscape mobile interactions are implemented without breaking portrait fallback or accessibility.
- [ ] **S08-AC-04:** All displayed business metrics, agent statuses, approvals and job states come from real API responses.
- [ ] **S08-AC-05:** Settings expose integration credentials safely, masked values, connection tests and health states.
- [ ] **S08-AC-06:** UI controls are connected to real API actions and display actual success/failure/pending states.
- [ ] **S08-AC-07:** Loading, empty, error, offline and permission-denied states are implemented.
- [ ] **S08-AC-08:** PWA installability, responsive behavior, keyboard access and critical accessibility checks pass.
- [ ] **S08-AC-09:** Health, logs, backup status and recovery guidance are accessible to the founder.

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
