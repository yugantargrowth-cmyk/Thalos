# Security Review — Mission L09: Intelligence

## Scope of Review
- LLM provider integration & credential decryption (`src/intelligence/llmClient.ts`)
- Context assembly & token budgeting (`src/intelligence/contextAssembler.ts`)
- Orchestration loop guard and tool execution boundary (`src/intelligence/orchestrator.ts`)
- Conversational chat endpoints (`src/api/routes/intelligence.ts`)

## Security Findings & Mitigations

### 1. Secret & Key Leak Prevention in Error Traces (L09-AC-09)
- **Vulnerability:** Uncaught HTTP provider errors or raw URLs from external LLM endpoints (e.g. Gemini `?key=...`) could expose raw API keys in application logs or customer-facing error messages.
- **Remediation:** Deep recursive regex redaction in `llmCall()` replaces all `key=[^&\s]+` substrings with `key=[REDACTED]`. Prompts and responses are never logged in plaintext; only message counts and token metrics are audited.

### 2. Runaway Execution & Infinite Loop Prevention (Resolved R-006)
- **Vulnerability:** An agent getting stuck on an unresolvable tool error could repeatedly call the same tool with identical parameters across all execution steps, wasting tokens and exhausting API quotas.
- **Remediation:** Implemented signature-based Loop Guard in `runToolLoop()`. Consecutive identical calls are intercepted with guidance to self-correct; repeated stagnation breaks the loop immediately into honest synthesis.

### 3. Request Hang Prevention via Timeout AbortControllers (L09-AC-07)
- **Vulnerability:** Stalled upstream provider sockets could hold worker threads and API handler contexts open indefinitely.
- **Remediation:** Configured 30,000ms timeouts with explicit `AbortController` signals on all REST fetch requests across Gemini and Cloudflare, matching Groq SDK's timeout configuration.

### 4. Bounded Context Ingestion (L09-AC-04)
- **Vulnerability:** Unbounded conversational history payloads could trigger context window overflow or excessive inference billing.
- **Remediation:** Heuristic token estimation (~4 chars/token) and strict token budgeting in `assembleContext()` preserve the system instructions and live business context while pruning older history in reverse chronological order.
