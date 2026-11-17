# MISSION S04 — HANDS

**Mission type:** Conceptual system  
**Status:** Execute only when selected in `MISSION_EXECUTION_ORDER.md`.

## Mission objective

Make THALOS capable of safely using real tools and integrations through a unified, observable, permission-aware execution pathway.

## Ownership and dependencies

**Primary dependencies:** L11 Execution, L10 Agents, L13 Persistence.

**Scope boundary:** Do not implement tool logic in frontend components or create a second dispatcher. n8n is not in initial scope.

Use `02_ARCHITECTURE/CANONICAL_OWNERSHIP_MAP.md` to resolve code ownership. If this mission requires changing a primitive owned by another layer, coordinate through that owner; do not create a duplicate.

## Acceptance criteria

- [ ] **S04-AC-01:** Every enabled tool has a unique ID, description, version, validated input schema, output schema, timeout, permission scope and evidence contract.
- [ ] **S04-AC-02:** Every enabled tool resolves to exactly one real handler or a clearly declared adapter.
- [ ] **S04-AC-03:** Disabled/unconfigured tools are not presented as executable.
- [ ] **S04-AC-04:** Tool dispatch validates agent authorization, user authorization, integration status, schema and approval policy server-side.
- [ ] **S04-AC-05:** Tool results use a normalized success/failure/pending structure with evidence and correlation IDs.
- [ ] **S04-AC-06:** Side-effecting tools implement idempotency or safe duplicate detection.
- [ ] **S04-AC-07:** Tool failures are explicit and never converted into success by swallowed exceptions.
- [ ] **S04-AC-08:** Contract tests cover every enabled tool, including handler registration and representative success/failure paths.

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
