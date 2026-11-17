# Canonical THALOS Architecture

## Architectural style

API-first modular monolith with independent background worker processes. Do not convert to microservices as a default response to complexity.

## Logical architecture

```text
Founder / Adaptive PWA
        |
        v
Express API + Authentication + Policy Enforcement
        |
        +--> Intelligence / Orchestrator
        |       +--> Model Router
        |       +--> Planning / Context Assembly
        |       +--> Nine Specialist Agents
        |
        +--> Tool Registry + Schema Validation + Permission Policy
        |       +--> Tool Dispatcher
        |       +--> Approval Queue / Approval Executor
        |
        +--> Business Domain Modules
        |       +--> Leads / CRM
        |       +--> Clients
        |       +--> Projects / Tasks / Follow-ups
        |       +--> Marketing / Social
        |       +--> Finance / Invoices / Payments
        |       +--> Proposals / Documents
        |       +--> Reporting / Analytics
        |       +--> Product Portfolio
        |
        +--> Memory / Knowledge / Hybrid RAG
        |       +--> File ingestion
        |       +--> Parsing / Chunking / Embeddings
        |       +--> Vector + Full-text retrieval
        |       +--> Provenance / Versioning / Consolidation
        |
        +--> Durable Jobs / Workflow Runtime / Scheduler
        |
        +--> Integrations / Browser / Web Research / Files
        |
        v
PostgreSQL / Supabase + pgvector + File Storage
        ^
        |
Independent Worker(s): leases, retries, idempotency, checkpoints,
dead-letter handling, job evidence and recovery
```

## Required architectural properties

- One canonical domain model and source of truth for each entity.
- API and worker share validated service-layer contracts; do not duplicate business logic in routes and jobs.
- Tool execution passes through one policy-aware dispatcher.
- Approval enforcement is server-side and atomic.
- Job handlers are registered, typed and observable.
- Long-running operations run in workers, not request handlers.
- Each job has durable state, attempt count, lease/heartbeat, timeout, idempotency key, error classification and result evidence.
- Integrations have typed adapters, credential vaulting, scopes and health checks.
- RAG ingestion and retrieval have traceable source IDs and document versions.
- Frontend reads actual API data; no fabricated metrics or hardcoded online statuses.
- Every important side effect has a persisted audit/evidence record.

## Data lifecycle

Use explicit states and transitions for:
- Lead and client lifecycle.
- Project and task lifecycle.
- Approval lifecycle.
- Job lifecycle.
- Document ingestion lifecycle.
- Integration lifecycle.
- Draft / outbound communication lifecycle.
- Invoice and payment lifecycle.

Transitions must be validated and concurrency-safe.

## Provider strategy

- Use provider abstraction and model routing.
- Groq may be a primary provider, but core orchestration must not be architecturally inseparable from one provider's proprietary tool-call format.
- Gemini and other configured providers may be adapters where supported.
- Web search should prefer SearXNG or another approved free/self-hostable option. Paid provider use must be optional, not a hard requirement.
- Never claim a provider is connected without a real connection test.
