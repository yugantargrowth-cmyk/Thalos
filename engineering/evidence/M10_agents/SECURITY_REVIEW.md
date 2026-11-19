# Security Review — Mission L10: Agents

## Scope of Review
- Agent permission boundaries and scope validation (`src/intelligence/agentService.ts`)
- Founder-facing orchestrator guardrails (`assertFounderFacingOrchestrator`)
- Delegation contracts and recursion limits (`delegateTask`)
- Tool authorization during delegation loops
- Social lookup SSRF protections (`src/execution/tools/socialLookup.ts`)

## Security Findings & Mitigations

### 1. Agent Permission Escalation Prevention (L10-AC-02, L10-AC-03)
- **Vulnerability:** Unchecked agent updates could allow an agent to expand its own whitelisted tools (e.g. adding financial tools to Scout) or lower its approval requirements.
- **Remediation:** Strict validation with `AgentUpdateSchema` ensures every tool added must already exist in `TOOL_PARAMS`. Modifying non-canonical agents is blocked. All updates require founder authorization and write an immutable before/after diff to `audit_log`.

### 2. Founder Conversation Guard (L10-AC-04)
- **Vulnerability:** Specialist agents (Hunter, Closer, Spark) might be invoked directly by external API clients, bypassing THALOS orchestrator guardrails, safety policies, and context assembly.
- **Remediation:** `assertFounderFacingOrchestrator('thalos')` enforces that only THALOS can interact directly with the founder in conversational sessions. Specialist agents are restricted to delegated execution.

### 3. Uncontrolled Delegation Recursion & Cycle Guards (L10-AC-06)
- **Vulnerability:** Autonomous agent delegation without boundaries could trigger cyclic call graphs (e.g. Scout -> Hunter -> Scout -> ...) causing stack overflows and runaway token consumption.
- **Remediation:** Enforced hard limit `MAX_DELEGATION_DEPTH = 3`. Implemented cycle detection: if `to_agent` is already in the `delegation_stack`, the request is rejected immediately. Upward delegation from specialist to orchestrator is explicitly forbidden.

### 4. Tool Whitelisting in Delegation Loops (L10-AC-08)
- **Vulnerability:** A specialist agent could receive a delegated prompt that instructs it to execute tools outside its designated `allowed_tools`.
- **Remediation:** Even within the delegation loop, every tool call is verified against the agent's database-defined `allowed_tools`. Disallowed tools are blocked and an error is returned to the model context without execution.

### 5. Social Lookup SSRF Protection (Resolved R-006)
- **Vulnerability:** `social_lookup` handles external profile lookups which could be abused for Server-Side Request Forgery against internal networks.
- **Remediation:** Canonical URL generation with strict platform whitelisting (`instagram`, `linkedin`, `x`, `facebook`, `youtube`) and routing through `websiteAuditExecute()` enforces RFC 1918, loopback, link-local, and IPv6 SSRF IP blocking.
