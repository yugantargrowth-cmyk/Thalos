# Initial Defect & Risk Register — Revalidate Before Fixing

| ID | Area | Initial observation | Required verification | Priority if confirmed |
|---|---|---|---|---|
| R-001 | Config/security | Development secrets and PIN hash have fallback defaults | Test startup in production mode with missing/default secrets | Critical |
| R-002 | Approvals | Approval state read/update may be non-atomic | Inspect DB constraints, route, executor; concurrency test | Critical |
| R-003 | Ingestion | Ingestion function catches errors; worker may mark job completed | Inject parser/embedding/DB failure and inspect both states | Critical |
| R-004 | Tool/job contract | CSV import queued job type may not have a worker handler | Trace UI/API/tool → queue → worker → result | High |
| R-005 | Tool schemas | `save_to_db` schema may be missing/incomplete | Inspect registry, runtime validation and tests | High |
| R-006 | Tool semantics | `social_lookup` maps to website audit | Confirm intended contract and source evidence | Medium |
| R-007 | Orchestrator | Native tool loop tied to Groq | Provider adapter contract and fallback tests | High |
| R-008 | Worker | Configured concurrency may be unused | Load/concurrency/lease tests | High |
| R-009 | Frontend | Referenced functions may be undefined | Static symbol scan and browser E2E | High |
| R-010 | Frontend | Some metrics/status may be hardcoded or fallback examples | Trace every displayed metric to API/DB source | High |
| R-011 | Frontend security | Untrusted data may enter `innerHTML` | Contextual XSS tests and safe rendering review | Critical |
| R-012 | SSRF | DNS/IP/redirect handling may be incomplete | Test private IPv4/IPv6, DNS rebinding and redirects | Critical |
| R-013 | Documentation | README claims 45 tests; source contains 95 declarations | Run suite and update documented commands/counts | Medium |
| R-014 | System proof | No E2E/live DB/provider evidence in ZIP | Create reproducible local E2E and live checks where credentials exist | High |

Severity labels are preliminary. Reclassify using demonstrated impact, exploitability, data sensitivity and reachability. Do not treat a static suspicion as a confirmed vulnerability.
