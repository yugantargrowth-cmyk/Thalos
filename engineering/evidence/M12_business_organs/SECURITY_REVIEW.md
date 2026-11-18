# SECURITY REVIEW: S05 — Business Organs (Mission 12)

## Security Architecture & Invariants Enforced

### 1. Human Approval Gate on External Social Publishing
- **Threat**: AI agents generating public social posts and immediately publishing them externally without founder review, risking brand damage, misinformation, or unauthorized commitments.
- **Defense**:
  - `MarketingService.publishPost` enforces a non-bypassable check: `if (current.status !== 'approved') throw new Error(...)`.
  - A post cannot be published without passing through `submitForApproval` and receiving an `approvePost` call containing an explicit `approvalId`.

### 2. Financial Integrity & Decimal Safety
- **Threat**: Floating-point rounding errors causing discrepancies between invoice line items and totals (e.g., 0.1 + 0.2 !== 0.3), or unauthorized double-crediting of payments.
- **Defense**:
  - All monetary calculations are clamped to 2 decimal places using `round2` and tested for invariant compliance (`|total - (subtotal + tax)| < 0.02`).
  - `recordPayment` verifies idempotency against `payment.reference` to prevent double-charging or double-crediting invoices.
  - Invoices cannot transition backwards from terminal states (`cancelled`, `void`). Paid invoices are immutable.

### 3. Cross-Tenant / Multi-Unit Boundary Integrity
- **Threat**: Multi-unit portfolio operations mixing client billing or project records across business lines.
- **Defense**:
  - Products and units (`yugantar_growth`, `thalos_ai`, `scout_leadgen`, `custom_solutions`) operate via explicit unit tags (`unit:thalos_ai`) on core tables, maintaining database integrity and single source of truth without unvalidated multi-table sprawl.

### 4. Non-Repudiation Audit Trail
- **Threat**: Modification of financial records, lead status, or project milestones without attribution.
- **Defense**:
  - Every lead creation, client conversion, progress update, payment recording, and post publication triggers an immutable audit event via `audit()`.
