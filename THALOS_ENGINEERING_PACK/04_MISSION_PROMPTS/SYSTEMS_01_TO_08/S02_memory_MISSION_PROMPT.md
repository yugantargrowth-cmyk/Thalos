# MISSION S02 — MEMORY

**Mission type:** Conceptual system  
**Status:** Execute only when selected in `MISSION_EXECUTION_ORDER.md`.

## Mission objective

Complete the durable memory and knowledge lifecycle across conversation history, user-approved facts, decisions, preferences, business records and source documents.

## Ownership and dependencies

**Primary dependencies:** L13 Persistence, L09 Intelligence, L11 Execution.

**Scope boundary:** Do not create a second vector store or duplicate RAG pipeline. Do not treat chat transcripts as verified memory by default.

Use `02_ARCHITECTURE/CANONICAL_OWNERSHIP_MAP.md` to resolve code ownership. If this mission requires changing a primitive owned by another layer, coordinate through that owner; do not create a duplicate.

## Acceptance criteria

- [ ] **S02-AC-01:** Memory categories and schemas distinguish episodic conversation, semantic facts, decisions, preferences, business records and source documents.
- [ ] **S02-AC-02:** Every durable memory item has provenance/source, created/updated timestamps, confidence or verification state, and ownership/scope.
- [ ] **S02-AC-03:** Retrieval uses hybrid vector and full-text search with relevance evaluation and source citations.
- [ ] **S02-AC-04:** Memory writes are validated, deduplicated and controlled; uncertain LLM inferences are not stored as confirmed facts.
- [ ] **S02-AC-05:** Corrections, supersession, expiry and deletion semantics are explicit and auditable.
- [ ] **S02-AC-06:** Conversation context is assembled with relevant memory without leaking unrelated records.
- [ ] **S02-AC-07:** Document versions and re-ingestion do not create uncontrolled duplicates.
- [ ] **S02-AC-08:** Tests cover retrieval relevance, source attribution, permission boundaries and lifecycle operations.

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
