# MISSION L11 — EXECUTION

**Mission type:** Technical backend layer  
**Status:** Execute only when selected in `MISSION_EXECUTION_ORDER.md`.

## Mission objective

Complete the shared execution substrate: tool registry, dispatcher, approval executor, durable queue, worker and workflow runtime contracts.

## Ownership and dependencies

**Primary dependencies:** L09 Intelligence, L10 Agents, L12 Business, L13 Persistence, L14 Runtime.

**Scope boundary:** Do not move business rules into generic dispatcher code. Do not enable n8n. Avoid duplicate workflow engines.

Use `02_ARCHITECTURE/CANONICAL_OWNERSHIP_MAP.md` to resolve code ownership. If this mission requires changing a primitive owned by another layer, coordinate through that owner; do not create a duplicate.

## Acceptance criteria

- [ ] **L11-AC-01:** Tool registry definitions and runtime handlers reconcile exactly; disabled tools are explicitly non-executable.
- [ ] **L11-AC-02:** All tool inputs/outputs are schema-validated.
- [ ] **L11-AC-03:** Permissions, integration readiness and approval requirements are enforced before side effects.
- [ ] **L11-AC-04:** Approval execution is atomic, single-use, idempotent and auditable.
- [ ] **L11-AC-05:** Job queue supports safe claiming, leases, heartbeat, retries, backoff, dead-letter and recovery.
- [ ] **L11-AC-06:** Worker concurrency and graceful shutdown are implemented and tested.
- [ ] **L11-AC-07:** Workflow runtime executes versioned definitions with dependency and failure semantics.
- [ ] **L11-AC-08:** Every side effect has correlation IDs and verifiable result evidence.
- [ ] **L11-AC-09:** Contract, integration, concurrency, retry and restart tests pass.

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
