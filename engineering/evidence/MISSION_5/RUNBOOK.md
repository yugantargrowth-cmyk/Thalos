# THALOS System Operator Runbook

## Overview
THALOS is an AI-powered business operating system built as an API-first Express modular monolith backed by Supabase (PostgreSQL + pgvector) and a Next.js static PWA frontend.

---

## 1. Prerequisites
- **Node.js:** >= 20.0.0
- **npm:** >= 9.0.0
- **Database:** Supabase project or PostgreSQL with `pgvector` and `uuid-ossp` extensions enabled.

---

## 2. Environment Configuration
Create a `.env` file in the project root:
```env
NODE_ENV=development
PORT=3000
WORKER_PORT=3001

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Authentication
OWNER_PIN_HASH=$2b$10$... # Generate with: node -e "console.log(require('bcrypt').hashSync('your_pin', 10))"
JWT_SECRET=your-secure-random-jwt-secret-min-32-chars
JWT_EXPIRY_SECONDS=86400

# Encryption
CREDENTIAL_MASTER_KEY=64-character-hex-string-for-aes-256-gcm

# Optional LLM API Keys (Can also be entered in dashboard under Execution & Settings → Integrations)
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
```

---

## 3. Database Migration
Apply all migrations sequentially using the migration runner or Supabase CLI:
```bash
npm run migrate
```
Migrations are located in `database/migrations/`:
1. `001_initial_schema.sql` (Leads, clients, tasks, projects, approval queue, follow-ups)
2. `002_agents_and_workflows.sql` (Agents, workflow definitions, workflow runs, jobs, tools)
3. `003_finance_and_documents.sql` (Invoices, line items, payments, tax rates, proposals, document chunks)
4. `004_daily_briefs_and_activity.sql` (Daily briefs, lead activities, audit log)
5. `005_knowledge_integrations_audit.sql` (Knowledge nodes, integrations, conversations)

---

## 4. Building the Application
### Backend Typecheck:
```bash
npm run typecheck
```

### Frontend Static PWA Export:
```bash
npm --prefix frontend run build
Copy-Item -Recurse -Force frontend/out/* public/
```
The static frontend assets are served by Express from `public/` at the root path `/`.

---

## 5. Running the Application
### Development Mode (with hot-reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```
- Web & API Server runs on `http://localhost:3000`
- Background Worker runs on `http://localhost:3001`
- Static Dashboard is accessible at `http://localhost:3000/`

---

## 6. Verification & Automated Tests
Execute the entire Vitest automated test suite:
```bash
npm test
```
- **Total Test Files:** 49
- **Total Tests:** 391 passing
- Expected Duration: ~45–50 seconds

---

## 7. Operational Endpoints
| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/health` | GET | Basic system liveness check | No |
| `/api/auth/login` | POST | Authenticates founder using PIN, returns JWT | No (rate limited) |
| `/api/intelligence/chat` | POST | Main conversational interface | Yes (Bearer token) |
| `/api/intelligence/brief` | GET | Today's daily brief | Yes (Bearer token) |
| `/api/leads` | GET, POST | CRM lead records | Yes (Bearer token) |
| `/api/clients` | GET, POST | Active clients | Yes (Bearer token) |
| `/api/approvals` | GET | Pending approval queue | Yes (Bearer token) |
| `/api/approvals/:id/approve` | POST | Executes queued action | Yes (Bearer token) |
| `/api/approvals/:id/reject` | POST | Rejects queued action | Yes (Bearer token) |
| `/api/finance/invoices` | GET, POST | Invoices list and creation | Yes (Bearer token) |
| `/api/knowledge/documents` | POST | Ingest document (PDF, TXT, CSV, DOCX) | Yes (Bearer token) |
| `/api/knowledge/search` | POST | Hybrid RAG vector/FTS search | Yes (Bearer token) |
| `/api/system/queue` | GET | Worker queue telemetry | Yes (Bearer token) |
| `/api/system/queue/retry-dead-letter` | POST | Replay failed dead-letter jobs | Yes (Bearer token) |
| `/api/integrations/settings` | POST | Save provider credentials to vault | Yes (Bearer token) |
| `/api/integrations/:provider/test` | POST | Live ping connection test | Yes (Bearer token) |

---

## 8. Troubleshooting & Common Scenarios
### Unconfigured LLM Providers:
If no API key is set, `/api/intelligence/chat` returns an honest `configuration_needed` message guiding the founder to open **Execution & Settings → Integrations** to enter an API key.

### Stuck or Dead-Letter Jobs:
Inspect `/api/system/queue` in the dashboard under Operations. To re-queue failed background jobs, click **Replay Dead-Letter Queue** or call `POST /api/system/queue/retry-dead-letter`.

### Authentication Issues:
If the dashboard prompts for PIN authentication, enter your configured owner PIN (default dev PIN: `1234`). The dashboard stores the JWT in `localStorage` and automatically attaches it to subsequent API calls.
