# CHANGES REGISTER — MISSION L12: BUSINESS

**Layer:** L12 (Business)  
**Date:** 2026-11-18  

---

### Created Files
- `src/business/entities.ts`: Canonical domain models, lifecycle status enums (`LEAD_STAGES`, `CLIENT_STATUSES`, `PROJECT_STATUSES`, `TASK_STATUSES`, `INVOICE_STATUSES`, `PROPOSAL_STATUSES`), and data contracts.
- `src/business/financeService.ts`: Centralized financial domain service providing `round2()`, `computeFinancialTotals()`, `createProposal()`, `createInvoice()`, `updateInvoiceStatus()`, and `recordPayment()`.
- `src/business/crmService.ts`: Centralized CRM domain service providing `normalisePhone()`, `createLead()`, `updateLead()`, `logLeadActivity()`, `scheduleFollowUp()`, `createClient()`, `updateClient()`, `createTask()`, `updateTask()`, `createProject()`, and `updateProject()`.
- `src/business/reportingService.ts`: Centralized BI service deriving live pipeline velocity and revenue analytics strictly from persisted database records.
- `tests/unit/financeService.test.ts`: 15 unit tests covering decimal arithmetic, GST rounding, invoice state transitions, duplicate payments, and overpayment prevention.
- `tests/unit/crmService.test.ts`: 17 unit tests covering phone normalisation, lead lifecycle, client conversion, and task/project completion rules.
- `tests/unit/reportingService.test.ts`: 4 unit tests covering pipeline and revenue calculation formulas and empty database edge cases.
- `tests/api/businessIntegration.test.ts`: 2 integration tests covering end-to-end business lifecycle (Lead -> Proposal -> Client -> Project -> Task -> Invoice -> Payment -> Reporting) and rollback behaviors.

### Modified Files
- `src/api/routes/finance.ts`: Refactored proposal, invoice, payment, and summary endpoints to delegate directly to `financeService` and `reportingService`.
- `src/api/routes/leads.ts`: Refactored lead creation and update endpoints to delegate directly to `crmService`.
- `src/api/routes/clients.ts`: Refactored client creation and update endpoints to delegate directly to `crmService`.
- `src/execution/tools/financeTools.ts`: Refactored `executeBuildProposal` and `executeBuildInvoice` to delegate directly to `financeService`.
- `src/execution/tools/crmTools.ts`: Refactored all 9 CRM tools (`executeCreateLead`, `executeUpdateLead`, `executeLogLeadActivity`, `executeScheduleFollowUp`, `executeCreateClient`, `executeCreateTask`, `executeUpdateTask`, `executeCreateProject`, `executeUpdateProject`) to delegate directly to `crmService`.
- `src/business/proposals/pdfBuilder.ts`: Updated `ProposalRecord` and `InvoiceRecord` interfaces to accept nullable string fields matching DB models.
