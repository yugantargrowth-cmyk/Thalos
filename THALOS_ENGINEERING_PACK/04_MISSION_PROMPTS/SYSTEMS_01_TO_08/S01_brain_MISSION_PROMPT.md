# MISSION S01 — BRAIN

**Mission type:** Conceptual system  
**Status:** Execute only when selected in `MISSION_EXECUTION_ORDER.md`.

## Mission objective

Deliver one truthful, plan-capable, context-aware central orchestrator that coordinates the nine specialist agents and the other THALOS systems.

## Ownership and dependencies

**Primary dependencies:** L09 Intelligence, L10 Agents, L11 Execution, L13 Persistence.

**Scope boundary:** Do not build a second tool registry, agent registry, memory database or job engine. Do not hardcode provider-specific tool execution into the domain orchestrator.

Use `02_ARCHITECTURE/CANONICAL_OWNERSHIP_MAP.md` to resolve code ownership. If this mission requires changing a primitive owned by another layer, coordinate through that owner; do not create a duplicate.

## Acceptance criteria

- [ ] **S01-AC-01:** One founder-facing orchestrator is the sole conversational entry point.
- [ ] **S01-AC-02:** Intent classification and planning are grounded in the current request and retrieved business context.
- [ ] **S01-AC-03:** Complex tasks can be decomposed into explicit, bounded subtasks and delegated to the correct existing specialist agents.
- [ ] **S01-AC-04:** Agent/tool results are collected with provenance, status and evidence; the final answer distinguishes completed, pending, failed and unverified work.
- [ ] **S01-AC-05:** The orchestrator can evaluate intermediate results and re-plan within bounded limits.
- [ ] **S01-AC-06:** Model routing is provider-adapter based; a provider without native tool calling does not silently pretend it executed tools.
- [ ] **S01-AC-07:** Context windows, token budgets, timeouts, cancellation and maximum tool/agent steps are enforced.
- [ ] **S01-AC-08:** No fabricated business facts, tool results or completion claims; missing context is stated explicitly.

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
