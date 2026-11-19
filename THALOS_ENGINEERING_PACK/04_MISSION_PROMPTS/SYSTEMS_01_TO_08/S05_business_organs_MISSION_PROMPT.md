# MISSION S05 — BUSINESS ORGANS

**Mission type:** Conceptual system  
**Status:** Execute only when selected in `MISSION_EXECUTION_ORDER.md`.

## Mission objective

Deliver a coherent business operating layer for Yugantar Growth across the eight approved business domains.

## Ownership and dependencies

**Primary dependencies:** L12 Business, L13 Persistence, L11 Execution, S07 Immune.

**Scope boundary:** Do not add dedicated website/SEO delivery or HR/team-management modules in this initial scope. Do not invent financial records.

Use `02_ARCHITECTURE/CANONICAL_OWNERSHIP_MAP.md` to resolve code ownership. If this mission requires changing a primitive owned by another layer, coordinate through that owner; do not create a duplicate.

## Acceptance criteria

- [ ] **S05-AC-01:** Leads/CRM supports capture, deduplication, stages, activities, follow-ups and source provenance.
- [ ] **S05-AC-02:** Client management links clients to leads, projects, contacts and commercial records.
- [ ] **S05-AC-03:** Projects/tasks support owners, status, due dates, dependencies and progress history.
- [ ] **S05-AC-04:** Marketing/social supports planning and drafting; publishing requires approval.
- [ ] **S05-AC-05:** Finance supports invoice lifecycle and payment records with explicit founder confirmation for material financial actions.
- [ ] **S05-AC-06:** Proposals/documents are generated from validated business data and stored with versions.
- [ ] **S05-AC-07:** Reporting derives metrics from actual persisted records and displays freshness/source; no hardcoded example numbers.
- [ ] **S05-AC-08:** Product portfolio supports multiple Yugantar-owned products/business units without duplicating core entities.
- [ ] **S05-AC-09:** Cross-module relationships, audit events and API contracts are tested.

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
