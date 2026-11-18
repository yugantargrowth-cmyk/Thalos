# SECURITY REVIEW — MISSION L12: BUSINESS

**Layer:** L12 (Business)  
**Security Lead Review:** Anti-tampering, Financial Invariants, Duplicate Payment Prevention, Audit Integrity  
**Status:** PASS

---

## 1. Financial Arithmetic & Decimal Safety
- **Vulnerability Addressed:** Floating-point rounding errors and client-supplied total manipulation.
- **Enforcement:** Client-supplied totals are completely ignored across tools and API routes. Totals are derived strictly server-side using `computeFinancialTotals()` and `round2()`.
- **Constraint Check:** Every calculation verifies `Math.abs(total - (subtotal + taxAmount)) < 0.02`, matching the PostgreSQL table constraint in `database/migrations/004_finance.sql` (`ABS(total - (subtotal + tax_amount)) < 0.02`).

## 2. Payment & Invoice State Machine Integrity
- **State Machine Rules:** Invoices follow strict transition paths defined in `VALID_INVOICE_TRANSITIONS`. Terminal states (`cancelled`, `void`) cannot transition to any other status.
- **Payment Validation:**
  - `amount > 0` strictly enforced.
  - Payments on `void` or `cancelled` invoices are rejected with HTTP 400.
  - Overpayments (`amount > balance_due`) are rejected.
  - Duplicate payment references (`reference` unique per invoice) are detected and rejected.
  - Payments table records remain immutable once written.

## 3. CRM Data Quality & Deduplication
- **Phone Normalisation:** `normalisePhone` standardizes phone numbers into E.164 (+91) format across both API routes and CRM tools, preventing split customer histories and duplicate lead generation.
- **Stage & Status Whitelists:** All entity transitions are checked against canonical whitelists (`VALID_LEAD_STAGES`, `VALID_CLIENT_STATUSES`, `VALID_TASK_STATUSES`, `VALID_PROJECT_STATUSES`).

## 4. Audit Trail & Attribution
- All business operations emit immutable audit log entries via `audit()` with entity type, entity ID, actor attribution (`founder` or authenticated identity), and relevant metadata.
