# 04. AI Agent, Tools, RAG & Memory Audit

## 1. Canonical 9 Agents & Orchestrator Governance
- **Agent Roster:** Exactly 9 canonical agents are defined (`src/intelligence/agentService.ts`):
  1. `thalos` (Orchestrator & Founder Companion)
  2. `scout` (Prospect Discovery)
  3. `hunter` (Outreach & Messaging)
  4. `closer` (Proposals & Deals)
  5. `operator` (Client Delivery & Tasks)
  6. `spark` (Content Ideation)
  7. `publisher` (Distribution Staging)
  8. `analyst` (Pipeline & Financial Metrics)
  9. `researcher` (Company Signals & Verification)
- **Founder-Facing Invariant:** `assertFounderFacingOrchestrator` blocks any specialist agent from communicating with the founder directly. All requests pass through THALOS.
- **Loop Guard (R-006):** In `src/intelligence/orchestrator.ts`, tool call signatures are tracked in a hash map. Identical consecutive calls break out with an honest synthesis, preventing infinite loops.

---

## 2. Tool Dispatcher & Execution Matrix
- **Schema Validation:** Every tool call input is validated against its JSON Schema definition in `src/intelligence/toolRegistry.ts` prior to execution.
- **Permission Boundaries:** `executeTool` verifies `agent.allowed_tools` and `agent.prohibited_actions`. Agents attempting to use unauthorized tools are rejected.
- **Server-Side Approval Gate:**
  - Tools with `requires_approval = true` (`send_email`, `send_whatsapp`, `build_invoice`, `build_proposal`) NEVER execute directly.
  - A SHA-256 payload hash is recorded in `approval_queue` and the tool execution returns `queued_for_approval: true`.

---

## 3. RAG Pipeline & Memory Governance
1. **Document Ingestion:**
   - Supported Formats: PDF, TXT, CSV, DOCX, XLSX, JSON.
   - Max file size: 20 MB.
   - Checksum Deduplication: Pre-upload SHA-256 calculation checks `documents.checksum_sha256` and rejects duplicates with HTTP 409 Conflict.
2. **Chunking & Embeddings:**
   - Sliding-window chunker with overlap preserves semantic coherence.
   - Embeddings generated via normalized `generateEmbedding` with graceful fallback to lexical search if provider is offline.
3. **Hybrid Search (RRF):**
   - Combines Postgres `tsvector` full-text search (BM25) and pgvector cosine similarity (`match_document_chunks`) via Reciprocal Rank Fusion formula:
     $$\text{score}(d) = \frac{w_{\text{fts}}}{K + \text{rank}_{\text{fts}}} + \frac{w_{\text{vec}}}{K + \text{rank}_{\text{vec}}}$$
4. **Memory Lifecycle & Scope Boundaries:**
   - `founder_stated` memories are stored as `verified` with confidence 1.0.
   - `agent_derived` inferences are downgraded to `unverified` with confidence capped at 0.85 to prevent hallucination persistence.
   - `assembleContext` filters memories by `allowedScopes` (`global` vs `client_alpha`), strictly preventing cross-client data leaks.
