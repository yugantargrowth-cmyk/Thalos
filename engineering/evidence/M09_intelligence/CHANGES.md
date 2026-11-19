# Changes Log — Mission L09: Intelligence

## Files Modified
- `src/intelligence/llmClient.ts`:
  - Implemented capability discovery (`getAvailableProviders()`) detailing provider support for chat, tool calling, and embeddings.
  - Normalized tool definition (`ToolDefinition`) and tool call schema (`LLMToolCall`) across Groq and Gemini.
  - Added timeout abort controllers (`30000ms`) on REST requests to prevent stalled provider connections.
  - Added explicit tool-call rejection for providers without tool calling capabilities (Cloudflare).
  - Enforced key redaction (`key=[REDACTED]`) in provider error messages.
- `src/intelligence/orchestrator.ts`:
  - Replaced direct Groq SDK coupling in `runToolLoop()` with normalized multi-provider `llmCall()` supporting automatic Gemini tool calling fallback.
  - Implemented Loop Guard tracking tool call signatures and breaking runaway repetitive loops (resolving **R-006**).
  - Implemented transient error retries for idempotent and network-failed tool calls (resolving **R-006**).
  - Integrated `assembleContext()` for token-budgeted prompt construction.
  - Added correlation ID tracking through tool executions and audit records.
- `src/api/routes/intelligence.ts`:
  - Extracted correlation IDs from request headers and passed to `thalosOrchestrate()`.

## Files Created
- `src/intelligence/contextAssembler.ts`: Context assembly module with heuristic token estimation, prompt budgeting, and reverse-order history pruning.
- `tests/unit/contextAssembler.test.ts`: Test suite verifying token budgeting, prompt preservation, and history pruning.
- `tests/unit/llmClient.test.ts`: Test suite verifying capability discovery, model routing, provider fallbacks, tool normalization, and key redaction.
- `tests/unit/orchestrator.test.ts`: Test suite verifying intent classification, agent selection, tool loops, loop guards, retries, and approval queues.
- `tests/api/intelligence.test.ts`: Integration test suite verifying `/api/intelligence/chat` and `/api/intelligence/brief`.
- `engineering/evidence/M09_intelligence/*`: Full evidence documentation pack.
