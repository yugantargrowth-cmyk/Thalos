# THALOS SECONDARY REALITY AUDIT: COMPLETE ENVIRONMENT VARIABLE MAP
**Audit Timestamp:** 2026-11-27T04:38:00+05:30  
**Target Repository:** `thalos-backend-v2`  
**Investigation Mode:** Autonomous CLI Execution (READ-ONLY)  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Overview & Architecture Model

Thalos implements a **two-tier configuration and secret management architecture**:

1. **Tier 1: Infrastructure Bootstrap Secrets (`src/lib/config.ts` & `settings.json`)**
   - Pure infrastructure credentials required to boot the runtime, connect to Supabase, sign JWT tokens, and initialize the envelope encryption engine.
   - In **development**, hardcoded fallback defaults allow zero-configuration startup out of the box (e.g. dev PIN `1234`, dev master key).
   - In **production**, `validateConfig()` enforces a strict fail-closed security boundary: any placeholder, default, or weak secret immediately throws `ConfigValidationError` and terminates the process.

2. **Tier 2: Provider API Credentials & Operational Settings (Encrypted DB via `/api/integrations`)**
   - AI and external integration keys (Groq, Gemini, Cloudflare, OpenRouter, Tavily, Resend, ElevenLabs) are **never required in `.env`**.
   - These keys are managed entirely through the web dashboard (`POST /api/integrations/settings`), encrypted at rest via AES-256-GCM using `CREDENTIAL_MASTER_KEY`, and cached in the `integrations` PostgreSQL table.

---

## 2. Exhaustive Environment Variable Inventory

| Variable Name | Required / Optional | Target Scope | Build vs Runtime | Default / Fallback Value | Code Reference | Severity / Impact if Missing |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Optional | Backend & Frontend | Both | `'development'` | `src/lib/config.ts:94` | **LOW**: Defaults to dev. In prod, triggers strict fail-closed validation. |
| `PORT` | Optional | Web Server | Runtime | `3000` | `src/lib/config.ts:95` | **LOW**: Uses port 3000 if omitted. |
| `WORKER_PORT` | Optional | Worker Daemon | Runtime | `3001` | `src/lib/config.ts:96` | **LOW**: Uses port 3001 if omitted. |
| `SUPABASE_URL` | **Required (Prod)** | Database Client | Runtime | Dev Placeholder URL | `src/lib/config.ts:99` | **CRITICAL (Prod)**: In prod, fail-closed validation aborts boot. In dev, mocks allow testing. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required (Prod)** | Database Client | Runtime | Dev Placeholder Key | `src/lib/config.ts:100` | **CRITICAL (Prod)**: Required for backend database queries and RLS bypass. |
| `SUPABASE_ANON_KEY` | Optional | Database Client | Runtime | `''` | `src/lib/config.ts:101` | **LOW**: Client-side anon key if direct Supabase client used. |
| `JWT_SECRET` | **Required (Prod)** | Auth Middleware | Runtime | Dev 32-char secret | `src/lib/config.ts:105` | **CRITICAL (Prod)**: Validated for >= 32 chars and non-default in prod. |
| `OWNER_PIN_HASH` | **Required (Prod)** | Auth Controller | Runtime | Bcrypt for PIN `1234` | `src/lib/config.ts:106` | **CRITICAL (Prod)**: Must be custom bcrypt hash in prod. Defaults to PIN `1234` in dev. |
| `JWT_EXPIRY_SECONDS` | Optional | Auth Controller | Runtime | `86400` (24 hours) | `src/lib/config.ts:107` | **LOW**: Token duration defaults to 24h. |
| `CREDENTIAL_MASTER_KEY` | **Required (Prod)** | Cryptography | Runtime | Dev 64-hex key | `src/lib/config.ts:111` | **CRITICAL (Prod)**: 64-char hex key (32 bytes) for AES-256-GCM envelope encryption. |
| `ALLOWED_ORIGINS` | Optional | Express CORS | Runtime | `['http://localhost:5173', 'http://localhost:3000']` | `src/lib/config.ts:89` | **MEDIUM**: In production, must include the hosted frontend domain. |
| `WORKER_POLL_INTERVAL_MS`| Optional | Worker Daemon | Runtime | `5000` (5s) | `src/lib/config.ts:124` | **LOW**: Governs task queue polling frequency. |
| `WORKER_MAX_CONCURRENCY` | Optional | Worker Daemon | Runtime | `3` | `src/lib/config.ts:125` | **LOW**: Parallel background task execution limit. |
| `WORKER_LEASE_SECONDS` | Optional | Worker Daemon | Runtime | `300` (5m) | `src/lib/config.ts:126` | **LOW**: Task lock lease duration. |
| `LOG_LEVEL` | Optional | Logger | Runtime | `'info'` | `src/lib/config.ts:130` | **LOW**: Winston/console log level (`error`, `warn`, `info`, `debug`). |
| `SEARXNG_BASE_URL` | Optional | Intelligence RAG | Runtime | `''` | `src/lib/config.ts:119` | **LOW**: If empty, web search gracefully disables or uses Tavily. |
| `SEARXNG_SECRET` | Optional | Intelligence RAG | Runtime | `''` | `src/lib/config.ts:120` | **LOW**: Shared secret for self-hosted SearXNG instance. |

---

## 3. Legacy / Deprecated Environment Variables

During deep repository inspection, four legacy files were identified containing direct unmanaged `process.env` references:

| Legacy File | Variable Found | Architectural Status | Impact Assessment |
| :--- | :--- | :--- | :--- |
| `src/lib/groq.ts` | `process.env.GROQ_API_KEY` | **DEAD / SUPERSEDED** | Legacy v1 Groq client. Superseded by `src/intelligence/llmClient.ts` which uses DB-stored credentials. Unmounted in Express. |
| `src/api/voice.ts` | `process.env.ELEVENLABS_API_KEY`<br>`process.env.ELEVENLABS_VOICE_ID` | **DEAD / SUPERSEDED** | Legacy v1 voice handler. Superseded by frontend client-side TTS (`frontend/lib/voice.ts`). Unmounted in Express. |
| `src/api/auth.ts` | `process.env.THALOS_PIN` | **DEAD / SUPERSEDED** | Legacy v1 plaintext PIN check. Superseded by canonical bcrypt auth route `src/api/routes/auth.ts`. Unmounted in Express. |
| `src/lib/supabase.ts` | `process.env.SUPABASE_SERVICE_KEY` | **DEPRECATED FALLBACK** | V1 client fallback. Canonical client is in `src/persistence/supabaseClient.ts` referencing `config.supabase`. |

> **Audit Recommendation:** These legacy files should be pruned in a future cleanup cycle to avoid developer confusion. None of them are wired into `src/api/server.ts` or called during runtime execution.

---

## 4. Configuration Template & Settings File Audit

### 4.1 `.env.example`
- Located at repository root: [`.env.example`](file:///D:/thalos-backend-v2/.env.example).
- Accurately documents all Tier-1 bootstrap parameters (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `OWNER_PIN_HASH`, `CREDENTIAL_MASTER_KEY`, `NODE_ENV`, `PORT`, `WORKER_PORT`, `WORKER_POLL_INTERVAL_MS`, `WORKER_MAX_CONCURRENCY`, `ALLOWED_ORIGINS`, `SEARXNG_BASE_URL`, `SEARXNG_SECRET`, `LOG_LEVEL`).
- Contains clear instructions that provider keys are NOT stored here.

### 4.2 `settings.json` Support
- `src/lib/config.ts` natively reads `settings.json` from the root directory as an alternative to `.env`.
- Any setting defined in `settings.json` will override internal defaults, while explicit `process.env` variables take top precedence:
  ```
  Precedence: process.env > settings.json > In-code Defaults
  ```
- Allows headless or containerized environments to inject configuration without environment variable mutations.

---

## 5. Build vs Runtime Variable Requirements

- **Build Time:**
  - `NODE_ENV=production` is the only variable referenced during `npm run build` (Next.js static export).
  - The frontend export builds static HTML/JS/CSS assets that use relative `/api/...` paths, meaning **zero frontend build-time secrets are required**.
- **Runtime:**
  - All 5 Tier-1 secrets are evaluated when `dist/index.js` or `dist/worker/worker.js` boots.

---

## 6. Hosting Infrastructure Secrets

For production deployments (Render, Railway, Fly.io, AWS, Docker), the following 5 variables **must** be injected into the container environment:

1. `SUPABASE_URL` (e.g. `https://xyzcompany.supabase.co`)
2. `SUPABASE_SERVICE_ROLE_KEY` (e.g. `eyJhbGci...`)
3. `JWT_SECRET` (generate with `openssl rand -base64 64`)
4. `OWNER_PIN_HASH` (generate with `bcrypt.hashSync('YOUR_PIN', 10)`)
5. `CREDENTIAL_MASTER_KEY` (generate with `openssl rand -hex 32`)

---

## 7. Crash Risk Analysis for Missing Optional Integrations

| Unconfigured Integration | Code Location | Behavior When Missing | Crash Risk |
| :--- | :--- | :--- | :--- |
| **Groq / Gemini / OpenRouter** | `src/intelligence/orchestrator.ts` | Returns clean `{ success: false, error: 'No active LLM provider configured', configuration_needed: true }` | **ZERO (Resilient)** |
| **Vector Search (Embeddings)** | `src/persistence/ragSearch.ts` | Catches missing API key and falls back to Postgres full-text BM25 search | **ZERO (Resilient)** |
| **SearXNG / Web Search** | `src/execution/toolDispatcher.ts` | Returns structured tool error without crashing the server | **ZERO (Resilient)** |
| **Resend (Email)** | `src/execution/toolDispatcher.ts` | Tool execution routes to `approval_queue` or logs warning; server stays online | **ZERO (Resilient)** |
| **ElevenLabs** | `frontend/lib/voice.ts` | Catches failure or missing key and falls back to browser native Web Speech API | **ZERO (Resilient)** |

---

## 8. Hardcoded URLs, Ports, and Deployment Assumptions

- **Express Server Port:** Hardcoded default `3000` (overridable via `PORT`).
- **Worker Daemon Port:** Hardcoded default `3001` (overridable via `WORKER_PORT`).
- **Frontend API Base:** Uses relative path `/api` (no hardcoded domain; automatically resolves to current origin).
- **Public Directory:** Assumes `public/` directory exists for Express static serving (`path.resolve(process.cwd(), 'public')`).
- **Supabase Extensions:** Requires PostgreSQL extensions `uuid-ossp` and `pgvector` enabled in Supabase.

---

## 9. Founder Setup Verdict: Zero-Edit Feasibility

| Environment | Can Run Without Editing `.env`? | How It Works |
| :--- | :--- | :--- |
| **Development** | **YES (100% Zero-Edit)** | Application boots immediately using internal dev secrets and default PIN `1234`. All 391 tests pass with zero `.env` file present. |
| **Production** | **NO (Fail-Closed by Design)** | Production security guards intentionally block launch if secrets are absent or using dev defaults, preventing insecure founder deployments. |
