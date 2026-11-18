# CHANGES LOG: S05 — Business Organs (Mission 12)

## New Files
- `src/business/marketingService.ts`: Domain service managing social post drafting, approval workflow, and enforced approval before publication.
- `src/business/portfolioService.ts`: Domain service coordinating the 4 canonical business units (`yugantar_growth`, `thalos_ai`, `scout_leadgen`, `custom_solutions`) and cross-unit portfolio analytics.
- `tests/unit/businessOrgans.test.ts`: Comprehensive test suite verifying S05-AC-01 through S05-AC-09 (15 unit tests).
- `engineering/evidence/M12_business_organs/*`: Mission evidence documentation pack.

## Modified Files
- `src/business/crmService.ts`:
  - Added `getClientCommercialProfile` composite aggregator linking clients to leads, projects, tasks, proposals, invoices, and payments.
  - Added `recordProjectProgress` with 0-100% boundary validation, auto-completion triggers, and audit logging.
- `src/business/financeService.ts`:
  - Added `generateProposalDocument` invoking `pdfBuilder` and persisting versioned proposal records into the `documents` table.
