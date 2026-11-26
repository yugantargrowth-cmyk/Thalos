# 03. Backend, API & Database Audit

## 1. Route Architecture & API Endpoints
The Express modular monolith mounts 12 canonical route handlers under `/api`:

| Route Module | Base Path | Key Methods | Auth Enforcement | Rate Limited |
|--------------|-----------|-------------|------------------|--------------|
| `auth.ts` | `/api/auth` | `POST /login`, `GET /session` | Public login / Protected session | Yes (`authLimiter`) |
| `intelligence.ts` | `/api/intelligence` | `POST /chat`, `GET /brief`, `GET/DELETE /conversations` | `requireAuth` | Yes (`apiLimiter`) |
| `leads.ts` | `/api/leads` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id` | `requireAuth` | Yes (`apiLimiter`) |
| `clients.ts` | `/api/clients` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id` | `requireAuth` | Yes (`apiLimiter`) |
| `approvals.ts` | `/api/approvals` | `GET /`, `POST /:id/approve`, `POST /:id/reject` | `requireAuth` | Yes (`approvalLimiter`) |
| `finance.ts` | `/api/finance` | `GET/POST /invoices`, `POST /invoices/:id/payments`, `POST /proposals` | `requireAuth` | Yes (`apiLimiter`) |
| `knowledge.ts` | `/api/knowledge` | `POST /documents`, `POST /search`, `GET /documents` | `requireAuth` | Yes (`uploadLimiter`) |
| `system.ts` | `/api/system` | `GET /health`, `GET /queue`, `POST /queue/retry-dead-letter`, `GET /jobs` | `requireAuth` | Yes (`apiLimiter`) |
| `integrations.ts` | `/api/integrations` | `GET /`, `POST /settings`, `POST /:provider/test` | `requireAuth` | Yes (`apiLimiter`) |
| `agents.ts` | `/api/agents` | `GET /`, `GET /:id`, `PATCH /:id` | `requireAuth` | Yes (`apiLimiter`) |
| `business.ts` | `/api/business` | `GET /dashboard-summary`, `GET /metrics` | `requireAuth` | Yes (`apiLimiter`) |
| `health.ts` | `/health` | `GET /health`, `GET /ready` | Public Liveness Check | No |

---

## 2. Database Schema & Migration Review
Database migrations in `database/migrations/` apply sequentially:
1. `001_initial_schema.sql`: Core business tables (`leads`, `clients`, `tasks`, `projects`, `approval_queue`, `follow_ups`).
2. `002_agents_and_workflows.sql`: Agent definitions, workflow definitions, workflow runs, tools catalogue, jobs queue.
3. `003_finance_and_documents.sql`: Invoices, line items, payments, tax rates, proposals, document chunks with pgvector embeddings.
4. `004_daily_briefs_and_activity.sql`: Daily briefs, lead activities, immutable append-only audit log.
5. `005_knowledge_integrations_audit.sql`: Knowledge nodes, integrations, multi-turn conversations.

**Key Database Invariants Verified:**
- Foreign key cascading and check constraints (e.g. `stage IN ('new', 'researching', ...)`).
- Row-Level Security (RLS) policies set to `service_role` access.
- Decimal-safe monetary arithmetic in `invoices` and `payments` preventing floating-point drift.
