# Mission 3: Defects & Remediation Log

| Defect ID | Description | Severity | Remediation | Status |
|-----------|-------------|----------|-------------|--------|
| DEF-M3-01 | Test payload mismatch with JSON Schema parameter definitions | Medium | Aligned tool test inputs in `mission3BusinessExecution.test.ts` with exact registered schemas (`create_lead` requires `name` & `phone`; `build_invoice` requires `client_name`, `due_date`, `line_items`; `send_email` requires `to`, `subject`, `html`). | Resolved |
| DEF-M3-02 | Risk of unapproved actions executing directly if `requires_approval` bypassed | Critical | Re-verified `executeTool` in `src/execution/toolDispatcher.ts`: lines 260-290 explicitly intercept any tool marked `requires_approval && !req.is_approved`, inserting it into `approval_queue` and halting execution. | Verified / Protected |
| DEF-M3-03 | Risk of agent cross-contamination or tool privilege escalation | High | Verified agent permission guard in `executeTool`: checks `agent.allowed_tools` and `agent.prohibited_actions`, blocking any non-permitted calls. | Verified / Protected |
