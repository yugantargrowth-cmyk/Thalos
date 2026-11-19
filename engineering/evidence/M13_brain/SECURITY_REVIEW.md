# SECURITY REVIEW: S01 — Brain (Mission 13)

## 1. Overview
The S01 (Brain) mission delivers the central cognitive orchestrator for THALOS (`thalosOrchestrate`), governing task decomposition, agent delegation, token bounding, and model provider routing. This security review evaluates access boundaries, model routing honesty, prompt injection exposure, and resource limit enforcement.

---

## 2. Security Invariants Evaluated

### 2.1 Sole Conversational Entry Point & Access Control
- **Invariant**: The founder communicates only with the central orchestrator (`thalos`). Specialist sub-agents (`scout`, `closer`, `marketer`, etc.) cannot be accessed directly by unauthorized clients as unmoderated chatbots.
- **Verification**: Sub-agent tasks are invoked strictly through `agentService.delegateTask` from the central brain. All routing passes through JWT authentication and role-based checks at `/api/intelligence/chat`.

### 2.2 Provider Routing Without Pretense (No Simulated Tool Execution)
- **Invariant**: LLM providers without native tool-calling capabilities (e.g. Cloudflare Workers AI) must never pretend they can execute tools, and requests requiring tool execution must never be dispatched to them without tool calling support.
- **Verification**: `getAvailableProviders()` inspects provider capabilities. Cloudflare explicitly specifies `toolCalling: false`. Tool dispatch is refused for non-tool-calling providers, preventing mock or fabricated results.

### 2.3 Anti-Hallucination & Honest Status Differentiation
- **Invariant**: Orchestrator must never fabricate task completion, invent tool outputs, or conceal failures.
- **Verification**:
  - `executeTaskPlan` tracks four distinct outcome categories: Completed, Actions Pending Founder Approval, Failed / Incomplete Actions, and Unverified.
  - Subtask errors are faithfully returned in `failedTasks` with error details rather than hidden.
  - Side-effecting actions (e.g. sending emails, publishing social posts, creating client contracts) generate approvals and are designated as `Actions Pending Founder Approval`.

### 2.4 Token Budgets, Timeouts, and Loop Guards
- **Invariant**: Cognitive loops must not exhaust API quotas, loop infinitely, or hang workers.
- **Verification**:
  - `assembleContext` enforces token budget limits (`maxTokens: 4000`, `maxHistoryTokens: 2000`) and prunes older conversation turns gracefully.
  - `MAX_STEPS` is capped at 6 in `orchestrator.ts`.
  - Re-planning attempts during complex task execution are bounded by `max_replans = 2`.
  - LLM timeouts are set on provider client instances (default 30s).
