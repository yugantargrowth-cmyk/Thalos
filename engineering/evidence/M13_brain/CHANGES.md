# CHANGES: S01 — Brain (Mission 13)

## Files Created / Modified

### 1. `src/intelligence/orchestrator.ts` (Modified)
- Added `TaskPlan`, `SubtaskPlan`, and `PlanExecutionResult` interfaces.
- Added `isComplexRequest(message)`: Detects multi-domain or multi-step requests requiring planning across specialist agents (e.g. research + outreach, audit + lead creation).
- Added `decomposeAndPlanTask(goal, message, intent)`: Uses LLM with structured decomposition instructions or deterministic fallback heuristics to generate bounded sequential subtasks mapped to canonical specialist agents (`scout`, `researcher`, `closer`, `marketer`, `architect`, etc.).
- Added `executeTaskPlan(plan)`: Sequentially executes subtasks via `agentService.delegateTask`, inspects intermediate results, records errors honestly, increments `replan_count` on failure, bounds re-planning, and aggregates execution results with complete provenance.
- Integrated task decomposition into `thalosOrchestrate`: Complex founder prompts are automatically decomposed into structured plans, executed across specialist agents, and presented with an honest breakdown of completed, pending approval, and failed actions.
- Preserved all existing single-turn conversational handling, approval loops, and tool execution.

### 2. `tests/unit/brainOrchestrator.test.ts` (Created)
- 9 unit tests verifying all 8 acceptance criteria:
  - S01-AC-01 & S01-AC-02: Sole conversational entry point and context-grounded intent classification.
  - S01-AC-03: Complex request detection and structured task decomposition into canonical subtasks.
  - S01-AC-04 & S01-AC-08: Complete provenance collection and honest differentiation of completed, pending approval, and failed tasks.
  - S01-AC-05: Intermediate failure evaluation, bounded re-planning (`replan_count`), and skipping downstream dependent steps.
  - S01-AC-06: Provider-adapter routing without pretense (Cloudflare has `toolCalling: false`).
  - S01-AC-07: Context windows, token budgets, and history truncation.
