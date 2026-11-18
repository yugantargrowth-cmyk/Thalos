# DEFECT REGISTER & RESOLUTIONS — MISSION L12: BUSINESS

**Layer:** L12 (Business)  
**Status:** All identified defects resolved

---

### Defect L12-D01: Uncentralized Duplicate Business Logic between API Routes and Tools
- **Severity:** High
- **Description:** Previous architecture implemented duplicate insertion and validation logic across `src/api/routes/finance.ts`, `src/execution/tools/financeTools.ts`, `src/api/routes/leads.ts`, and `src/execution/tools/crmTools.ts`. If business validation changed, discrepancies emerged between tool execution and web endpoints.
- **Root Cause:** Absence of centralized domain layer (`src/business/`).
- **Correction:** Established `CrmService` (`src/business/crmService.ts`) and `FinanceService` (`src/business/financeService.ts`). Replaced scattered database inserts in API routes and tools with unified calls to domain service contracts.

### Defect L12-D02: Payment Recording Lacked Balance Update & Duplicate Reference Checks
- **Severity:** High
- **Description:** `POST /api/finance/invoices/:id/payments` inserted payment records without validating `balance_due`, without checking if the invoice was already fully paid or voided, without updating invoice `status`, and without checking duplicate transaction references.
- **Root Cause:** Incomplete payment handler in finance route.
- **Correction:** Implemented `financeService.recordPayment()` which enforces invoice existence, checks status against terminal states, verifies against overpayment, prevents duplicate references, automatically decrements `balance_due`, transitions invoice status (`partially_paid` or `paid`), and emits an audit event.

### Defect L12-D03: Type Incompatibility in PDF Builder Records for Nullable Values
- **Severity:** Medium
- **Description:** Database records store `null` for optional text fields (`client_email`, `custom_scope`, `valid_until`, `notes`), while `pdfBuilder.ts` typed them as strictly `string | undefined`, leading to type mismatch during tool and service delegation.
- **Root Cause:** Strict undefined typing in PDF interfaces.
- **Correction:** Updated `ProposalRecord` and `InvoiceRecord` in `src/business/proposals/pdfBuilder.ts` to accept `string | null | undefined`.
