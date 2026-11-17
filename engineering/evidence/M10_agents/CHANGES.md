# Changes Log — Mission L10: Agents

## Files Modified
- `src/execution/toolDispatcher.ts`:
  - Routed `social_lookup` to dedicated handler in `src/execution/tools/socialLookup.ts` (resolving defect **R-006**).
- `src/api/routes/system.ts`:
  - Added `PATCH /api/system/agents/:agentId` route for validated, audited agent configuration updates.
  - Added `POST /api/system/agents/:agentId/delegate` route for task delegation execution.

## Files Created
- `database/migrations/008_refresh_agent_definitions.sql`: Migration refreshing the 9 canonical agent definitions with versioned system prompts, missions, allowed tools, and approval policies (resolving defect **R-007**).
- `src/execution/tools/socialLookup.ts`: Dedicated tool resolving platform & handle queries into canonical URLs with SSRF validation.
- `src/intelligence/agentService.ts`: Core agent service managing the 9 canonical agents, configuration validation via Zod, founder-facing orchestrator guards, bounded task delegation, recursion limits, cycle prevention, and provenance tracking.
- `tests/unit/socialLookup.test.ts`: Test suite verifying social lookup platform canonicalization, handle resolution, error handling, and URL routing.
- `tests/unit/agentService.test.ts`: Test suite verifying the 9-agent roster, orchestrator guards, update validation, delegation recursion limits, cycle prevention, and provenance capture.
- `tests/api/agents.test.ts`: Integration test suite verifying `GET /api/system/agents`, `GET /api/system/agents/:agentId`, `PATCH /api/system/agents/:agentId`, and `POST /api/system/agents/:agentId/delegate`.
- `engineering/evidence/M10_agents/*`: Complete evidence documentation pack.
