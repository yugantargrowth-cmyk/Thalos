# SECURITY REVIEW: S02 — Memory (Mission 10)

## Security Architecture & Invariants Enforced

### 1. Scope Boundary Enforcement & Anti-Data-Leakage
- **Threat**: Cross-tenant/cross-client information leakage via RAG or context retrieval (e.g. Agent working for Client A recalls confidential pricing or NDA terms belonging to Client B).
- **Defense**:
  - `memoryService.retrieveRelevantMemory` enforces explicit `allowedScopes`. By default, only `['global', clientScope]` is queried.
  - `assembleContext` filters `relevantMemories` against `allowedScopes`. Memory records tagged with unauthorized client scopes are strictly omitted from prompt assembly and source attribution.
  - Verified by negative tests in `tests/unit/memoryLifecycle.test.ts`.

### 2. Hallucination & Fact Poisoning Prevention (Inference Gating)
- **Threat**: Agent hallucinated or speculative statements in conversation transcripts being persisted into the knowledge base as authoritative ground truth, leading to permanent state corruption.
- **Defense**:
  - `storeMemoryItem` evaluates `source_type`. If `source_type === 'agent_derived'`, attempts to mark it `verified` are rejected/downgraded to `unverified`, and confidence is capped at 0.85.
  - Only founder confirmation or explicit human verification (`verifyMemoryItem`) can promote an item to `verified` with 1.0 confidence.

### 3. Non-Repudiation & Audit Trail
- **Threat**: Silent alteration, deletion, or tampering with organizational memory, decisions, and agreements.
- **Defense**:
  - Every creation (`memory.created`), supersession (`memory.superseded`), deletion (`memory.deleted`), and verification status update (`memory.verified` / `memory.disputed`) writes an immutable audit record to the `audit_events` log via `src/lib/audit.ts`.

### 4. Injection & Vector Poisoning
- **Threat**: Re-ingesting malicious or oversized duplicate documents to consume vector store capacity or exhaust LLM embedding quotas.
- **Defense**:
  - SHA-256 content checksum deduplication in `ingestionQueue.ts` detects identical content and skips vector generation, reusing previously indexed chunks.
