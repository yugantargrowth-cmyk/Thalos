# Defects Register — Mission L11: Execution

## Resolved in Mission L11

| Defect ID | Severity | Description | Resolution | Status |
|---|---|---|---|---|
| **R-002** | High | Race condition on approval actions: concurrent requests could double-execute approved sensitive tools. | Added atomic `.eq('status', 'pending')` conditional update to `/api/approvals/:id/approve` and `/reject` returning HTTP 409 on conflict. | **FIXED** |
| **R-004** | High | Missing CSV import worker handler: `import_csv` jobs queued by `reportingTools.ts` failed with "No handler registered". | Implemented `WorkerService.prototype.importCsv` in `src/worker/worker.ts` with CSV parsing and batch upserting into `leads` and `clients`. | **FIXED** |
| **R-005** | Medium | Missing schema definition for `save_to_db` and related tools in `toolRegistry.ts`. | Added input parameter schemas for `save_to_db`, `sheets_import`, `ingest_knowledge_file`, `send_email`, and `send_whatsapp` in `TOOL_PARAMS`. | **FIXED** |
| **R-008** | Medium | Worker concurrency limit was not enforced in background polling loop. | Implemented concurrency gate checking `this.activeJobs.size >= config.worker.maxConcurrency` in `WorkerService.pollOnce()`. | **FIXED** |

## Remaining Defects for Subsequent Missions
- **R-006** (Medium): Orchestrator lacks tool execution retry logic and loop guard (Scope: Mission L09 Intelligence).
- **R-007** (Medium): Missing specialist agent system prompts in database seeds (Scope: Mission L10 Agents).
