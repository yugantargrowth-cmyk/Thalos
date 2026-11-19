# Defects Register — Mission L10: Agents

## Resolved in Mission L10

| Defect ID | Severity | Description | Resolution | Status |
|---|---|---|---|---|
| **R-006** | Medium | Tool semantics: `social_lookup` mapped directly to `websiteAudit.execute`, failing when invoked with `{ platform, handle }` without `url`. | Created dedicated `src/execution/tools/socialLookup.ts` that maps platform and handles into canonical URLs and performs SSRF-validated audits without crashing. | **FIXED** |
| **R-007** | Medium | Seed conflict resolution did not refresh specialist agent system instructions or allowed tools. | Created migration `008_refresh_agent_definitions.sql` updating all 9 canonical agents with versioned system prompts, missions, allowed tools, and approval policies with a complete `ON CONFLICT DO UPDATE SET` clause. | **FIXED** |

## Remaining Defects for Subsequent Missions

| Defect ID | Severity | Description | Target Mission |
|---|---|---|---|
| **R-009** | High | Frontend: Referenced functions may be undefined in client bundle. | Mission S08 (Body & Home) |
| **R-010** | High | Frontend: Some metrics/status may be hardcoded or fallback examples. | Mission S08 (Body & Home) |
| **R-011** | Critical | Frontend security: Untrusted data may enter `innerHTML`. | Mission S08 / S07 |
| **R-012** | Critical | SSRF: DNS/IP/redirect handling may be incomplete for private IPv6 / DNS rebinding. | Mission S07 (Immune) |
| **R-013** | Medium | Documentation: README claims 45 tests; source contains 188+ tests. | Mission S08 / E15 |
| **R-014** | High | System proof: Need reproducible live scenario verification. | Mission E15 |
