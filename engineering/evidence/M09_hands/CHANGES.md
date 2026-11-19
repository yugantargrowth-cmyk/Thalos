# CHANGES: MISSION S04 — HANDS

## Modified Files
1. `src/intelligence/toolRegistry.ts`:
   - Defined `ToolContract` interface with unique ID, description, version, category, permission level, timeout, approval policy, idempotency flag, input/output schemas, and evidence contracts.
   - Added `TOOL_OUTPUT_SCHEMAS` defining JSON schemas for all 25 tools.
   - Added `TOOL_CONTRACTS` mapping all 25 tools.
   - Added `getToolContract()`, `getAllToolContracts()`, and `validateToolInput()`.
   - Added `n8n_trigger` parameter schema to `TOOL_PARAMS`.
   - Hardened `loadToolSpecs()` to filter out tools with status `needs_configuration` or `disabled`.
2. `src/execution/toolDispatcher.ts`:
   - Added `n8n_trigger` declared adapter to `HANDLERS`.
   - Updated `ToolResult` interface with normalized properties: `tool_id`, `correlation_id`, `timestamp`.
   - Added `user_role` and `idempotency_key` to `ToolCallRequest`.
   - Added server-side user authorization enforcement (`req.user_role` against `tool.permission_level >= 2`).
   - Integrated `validateToolInput()` for strict input schema validation.
   - Implemented safe duplicate detection and idempotency replay via `inputs_hash` and `idempotency_key` querying `tool_executions`.
   - Ensured all return paths use `makeResult()` producing normalized results.

## Newly Created Files
1. `tests/contract/toolContracts.test.ts`:
   - Contract test suite testing contract schema completeness, 100% handler registration, exclusion of unconfigured tools, server-side user authorization, idempotency caching, and explicit failure reporting.
