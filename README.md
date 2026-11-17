# THALOS Backend
**Agentic AI Business Operating System — Yugantar Growth**

## Stack
- **Runtime:** Node.js 20+ / TypeScript ESM
- **API:** Express + Helmet + CORS + Rate limiting
- **Database:** Supabase (PostgreSQL + pgvector)
- **LLM:** Groq (primary) → Gemini (quality/fallback) → Cloudflare Workers AI (last resort)
- **Search:** SearXNG self-hosted → Tavily fallback
- **Email:** Resend
- **Worker:** Durable job queue with `FOR UPDATE SKIP LOCKED`

---

## Setup

### 1. Prerequisites
- Node.js 20+
- A Supabase project (free tier works)
- At least one LLM API key (Groq free tier recommended to start)

### 2. Install
```bash
npm install
```

### 3. Configure environment
```bash
cp bootstrap-config.example .env
# Edit .env with your real values
```

Generate your PIN hash:
```bash
node scripts/hash-pin.js YOUR_PIN
# Copy the output hash into OWNER_PIN_HASH in .env
```

Generate credential master key:
```bash
openssl rand -hex 32
# Copy into CREDENTIAL_MASTER_KEY in .env
```

### 4. Run database migrations
Run each file in order against your Supabase project using the SQL editor:
```
database/migrations/001_extensions_and_config.sql
database/migrations/002_agents_and_workflows.sql
database/migrations/003_business_layer.sql
database/migrations/004_finance.sql
database/migrations/005_knowledge_integrations_audit.sql
```
Run `006_vector_index.sql` **only after** you have ingested documents.

### 5. Configure provider keys
Start the API, then set your first API key via the Integrations endpoint:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"pin":"YOUR_PIN"}'

# Use the returned token for all subsequent requests
curl -X POST http://localhost:3000/api/integrations/groq/credential \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"gsk_your_groq_key_here"}'

# Test the connection
curl -X POST http://localhost:3000/api/integrations/groq/test \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 6. Run
```bash
# API server
npm run dev

# Background worker (separate terminal)
npm run dev:worker
```

---

## Architecture

```
src/
├── api/
│   ├── server.ts           # Express app bootstrap
│   ├── middleware/         # Auth, rate limiting, error handler
│   └── routes/             # auth, leads, clients, finance, knowledge,
│                           # integrations, approvals, intelligence, system
├── intelligence/
│   ├── orchestrator.ts     # THALOS intent routing + agent delegation
│   ├── llmClient.ts        # Groq → Gemini → Cloudflare fallback chain
│   └── brief.ts            # Daily brief generator
├── execution/
│   ├── toolDispatcher.ts   # Permission check + handler routing
│   ├── approvalExecutor.ts # Runs approved actions
│   └── tools/              # 25 tool handlers
├── persistence/
│   ├── ragSearch.ts        # Hybrid vector + FTS knowledge search
│   └── ingestionQueue.ts   # Document chunking + embedding pipeline
├── business/
│   └── proposals/          # PDF builder for proposals and invoices
├── integrations/
│   └── connectionTester.ts # Provider health tests
├── worker/
│   └── worker.ts           # Durable background job processor
└── lib/
    ├── config.ts           # Environment config loader
    ├── supabase.ts         # Service-role DB client
    ├── vault.ts            # AES-256-GCM credential encryption
    ├── audit.ts            # Append-only audit log
    └── logger.ts           # Winston structured logger
```

## 9 Agents
| Agent | Role | Approval Policy |
|-------|------|-----------------|
| THALOS | Orchestrator — only founder-facing agent | notify |
| Scout | Prospect discovery | notify |
| Hunter | Outreach drafting | **require** |
| Researcher | Verification + knowledge | notify |
| Analyst | Metrics + reporting | notify |
| Operator | Clients, projects, tasks | **require** |
| Spark | Content creation | **require** |
| Publisher | Approved distribution only | **require** |
| Closer | Proposals, invoices, deals | **require** |

## Key invariants
- API keys **never** stored in plaintext — AES-256-GCM envelope encryption
- Tools with `requires_approval=true` **never** execute without founder sign-off
- Payment records **only** created by explicit founder confirmation
- Audit log is **append-only** — mutation triggers an exception
- SSRF guard blocks all internal network ranges in the website audit tool
- WhatsApp "sending" is a manual `wa.me` link — delivery is never assumed

## Tests
```bash
npm test                 # Run all 113 automated unit, security, API, and worker tests
npm run test:unit        # Unit tests
npm run test:api         # API tests
npm run test:security    # Security and SSRF tests
npm run test:worker      # Background worker tests
npm run test:coverage    # With coverage report
npm run lint             # ESLint (flat config)
npm run typecheck        # TypeScript validation
npm run build            # Compile to dist/
```

## Production deployment
- **API:** Fly.io (512 MB) or Railway — set env vars as platform secrets
- **Worker:** Separate Fly Machine or Railway service
- **Database:** Supabase (free tier starts at 500 MB)
- **Search:** SearXNG on a small VPS or Fly.io container

## Disclaimer
Tax and financial calculations are for internal reference only.  
Always verify with a qualified CA for GST/tax compliance.
