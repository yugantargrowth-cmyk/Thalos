# Mission 5: Security, Reliability & Acceptance Capability Map

## Overview
This capability map details the security defenses, reliability guarantees, and complete founder operational workflows verified under Mission 5.

| Capability ID | Capability Name | Component / Service | Implementation Status | Verification Evidence |
|---------------|-----------------|---------------------|-----------------------|-----------------------|
| C-M5-01 | Founder PIN & JWT Auth Boundary | `src/api/routes/auth.ts`, `src/api/middleware/auth.ts` | Complete | `tests/api/mission5FinalAcceptance.test.ts` (authenticates founder with PIN, issues JWT; protects all business endpoints) |
| C-M5-02 | Companion Interaction & Durable Tracking | `src/api/routes/intelligence.ts` | Complete | `tests/api/mission5FinalAcceptance.test.ts` (returns conversation UUID, user message UUID, assistant message UUID, and action status) |
| C-M5-03 | Canonical CRM Pipeline & Lead Conversion | `src/api/routes/leads.ts`, `src/business/crmService.ts` | Complete | `tests/api/mission5FinalAcceptance.test.ts` (creates leads with deduplication, lists pipeline stages) |
| C-M5-04 | Approval Queue & Founder Intervention | `src/api/routes/approvals.ts` | Complete | `tests/api/mission5FinalAcceptance.test.ts` (retrieves pending approvals, executes atomic reject/approve transitions) |
| C-M5-05 | Financial Invoicing & Payment Recording | `src/api/routes/finance.ts`, `src/business/financeService.ts` | Complete | `tests/api/mission5FinalAcceptance.test.ts` (records payment against invoice with reference/UTR and balance update) |
| C-M5-06 | Worker Queue Telemetry & Dead-Letter Replay | `src/api/routes/system.ts` | Complete | `tests/api/mission5FinalAcceptance.test.ts` (queue telemetry and dead-letter retry) |
| C-M5-07 | Integration Credential Vaulting | `src/api/routes/integrations.ts`, `src/lib/vault.ts` | Complete | `tests/api/mission5FinalAcceptance.test.ts` (secure server vault save and retrieval) |
| C-M5-08 | SSRF & Private IP Interception | `src/security/ssrf.ts` | Complete | `tests/security/ssrf.test.ts` (26 tests blocking private IP ranges and AWS metadata) |
| C-M5-09 | Production Fail-Closed Secret Validation | `src/lib/config.ts` | Complete | `tests/security/immuneSystem.test.ts` (blocks production startup if placeholder dev secrets are present) |
