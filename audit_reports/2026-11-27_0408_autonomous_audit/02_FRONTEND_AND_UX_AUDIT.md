# 02. Frontend & User Experience Audit

## 1. Static PWA Structure & Export Status
- **Framework:** Next.js 16.4.3 / React 19 / Tailwind CSS
- **Export Target:** Static HTML export configured via `output: 'export'` in `frontend/next.config.mjs`
- **Output Artifacts:** 57 static routes compiled to `frontend/out` and mirrored to Express `public/`
- **Static Pages Count:** 57 total pages (all prerendered SSG/Static)

---

## 2. Visible Control & Screen Inventory

| Screen / Workspace | Primary Controls | Backend Link | Observed State | Classification |
|--------------------|------------------|--------------|----------------|----------------|
| **Global Shell** | Lock/Unlock PIN button, Founder PIN modal | `POST /api/auth/login` | Prompts for PIN, vaults JWT in localStorage | **Verified working** |
| **Global Companion** | Voice toggle, Mic button, Chat input, Send button | `POST /api/intelligence/chat` | Sends message with Bearer token, renders response & action status | **Verified working** |
| **My Day / Overview** | Daily Brief card, Priority actions | `GET /api/intelligence/brief` | Fetches today's brief, generates if missing | **Verified working** |
| **My Day / Approvals** | Approval cards, Approve button, Reject button | `GET /api/approvals`, `POST /api/approvals/:id/approve`, `/reject` | Fetches pending queue, executes atomic review transition | **Verified working** |
| **My Day / Active Ops** | Replay Dead-Letter Queue button | `POST /api/system/queue/retry-dead-letter` | Resets dead-letter jobs to queued | **Verified working** |
| **Revenue / Lead CRM** | New Lead button, Stage filter, Lead cards | `GET /api/leads`, `POST /api/leads`, `PATCH /api/leads/:id` | Lists CRM pipeline, deduplicates by phone number | **Verified working** |
| **Revenue / Finance** | Invoices list, Verify UTR / Record Payment modal | `GET /api/finance/invoices`, `POST /api/finance/invoices/:id/payments` | Records payment against invoice, checks duplicate reference | **Verified working** |
| **Knowledge / Search** | Document Upload dropzone, RAG query bar | `POST /api/knowledge/documents`, `POST /api/knowledge/search` | Checks SHA-256 hash, queues ingestion, returns hybrid search results | **Verified working** |
| **Settings / Integrations** | API Key inputs, Server Vault Save button, Test Connection button | `POST /api/integrations/settings`, `POST /api/integrations/:provider/test` | Encrypts credentials via AES-256-GCM in vault, returns connection ping | **Verified working** |

---

## 3. UX Safety & Failure State Handling
- **Missing Token Interception:** `frontend/lib/api.ts` listens for HTTP 401 responses and dispatches `thalos_auth_required`, prompting the user for PIN authentication.
- **Voice Fallback:** `frontend/lib/voice.ts` checks `isSpeechRecognitionSupported()` and `isSpeechSynthesisSupported()`; if unsupported, voice controls gracefully fall back to text.
- **Empty / Loading States:** All data-fetching cards display visual skeleton loaders or informative empty states (e.g. "No pending approvals requiring founder attention").
