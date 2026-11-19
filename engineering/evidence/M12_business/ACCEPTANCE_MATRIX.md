# ACCEPTANCE MATRIX — MISSION L12: BUSINESS

**Layer:** L12 (Business)  
**Evaluator:** Principal Software Architect & QA Lead  
**Verification Date:** 2026-11-18  
**Result:** ALL PASS

---

| ID | Criterion | Status | Evidence / Verification Notes |
|---|---|---|---|
| **L12-AC-01** | Canonical domain entities and relationships are documented. | **PASS** | Codified in `src/business/entities.ts` with strict TypeScript types, status enums (`LEAD_STAGES`, `CLIENT_STATUSES`, `PROJECT_STATUSES`, `TASK_STATUSES`, `INVOICE_STATUSES`, `PROPOSAL_STATUSES`), and documented domain entity interfaces (`LeadEntity`, `ClientEntity`, `ProjectEntity`, `TaskEntity`, `InvoiceEntity`, `ProposalEntity`, `PaymentEntity`). |
| **L12-AC-02** | Lead, client, project, task, follow-up, marketing content, finance, proposal and portfolio operations have explicit service contracts. | **PASS** | Implemented in `src/business/crmService.ts` and `src/business/financeService.ts` with explicit input/output contracts (`CreateLeadInput`, `UpdateLeadInput`, `CreateClientInput`, `CreateProjectInput`, `CreateTaskInput`, `ScheduleFollowUpInput`, `CreateProposalInput`, `CreateInvoiceInput`, `RecordPaymentInput`). |
| **L12-AC-03** | Validation, lifecycle transitions, ownership and audit rules are centralized in domain services. | **PASS** | Centralized validation, status transition guards, and immutable audit logging (`audit()`) in `crmService` and `financeService`. Verified via 17 unit tests in `crmService.test.ts` and 15 unit tests in `financeService.test.ts`. |
| **L12-AC-04** | Financial calculations use decimal-safe arithmetic and explicit currency/rounding rules. | **PASS** | Implemented `round2()` and `computeFinancialTotals()` in `financeService.ts`. Validated exact subtotal, 18% GST calculation, tax bounds (0–100%), and DB invariant check `ABS(total - (subtotal + tax_amount)) < 0.02`. |
| **L12-AC-05** | Invoice and payment state transitions prevent duplicate or unauthorized records. | **PASS** | Enforced `VALID_INVOICE_TRANSITIONS` state machine (`draft -> approved -> sent -> partially_paid -> paid -> void`). Prevented payments on void/cancelled/paid invoices, rejected overpayments (`payment > balance_due`), and blocked duplicate payment references. Verified in `financeService.test.ts`. |
| **L12-AC-06** | Reports are derived from persisted records with defined filters and timestamps. | **PASS** | Implemented `ReportingService` (`src/business/reportingService.ts`) deriving live pipeline velocity, stage counts, conversion rate %, MRR, total invoiced, total collected, total outstanding, and collection ratio % strictly from database records. Verified in `reportingService.test.ts`. |
| **L12-AC-07** | API routes and tools call the same domain services rather than duplicating logic. | **PASS** | Refactored `src/execution/tools/crmTools.ts`, `src/execution/tools/financeTools.ts`, `src/api/routes/finance.ts`, `src/api/routes/leads.ts`, and `src/api/routes/clients.ts` to delegate domain logic to `crmService` and `financeService`. |
| **L12-AC-08** | Integration tests cover cross-entity workflows and rollback behavior. | **PASS** | Implemented `tests/api/businessIntegration.test.ts` verifying end-to-end lifecycle (Lead -> Proposal -> Client -> Project -> Task -> Invoice -> Payment -> Reporting) and verifying rollback/preservation on illegal transitions, duplicate references, and overpayments. |
