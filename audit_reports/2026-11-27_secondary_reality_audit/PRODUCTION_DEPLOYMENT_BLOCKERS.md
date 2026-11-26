# THALOS SECONDARY REALITY AUDIT: PRODUCTION DEPLOYMENT BLOCKERS
**Audit Timestamp:** 2026-11-27T04:39:30+05:30  
**Target Repository:** `thalos-backend-v2`  
**Investigation Mode:** Autonomous CLI Execution (READ-ONLY)  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

This report identifies all potential blockers, architectural risks, prerequisite gaps, and deployment constraints when moving Thalos from the verified local development environment to a live production cluster.

Every issue is categorized by **Severity** (`BLOCKER`, `HIGH`, `MEDIUM`, `LOW`, `INFO`) and assigned an empirical **Verification Status**.

---

## 2. Production Deployment Blocker Matrix

| ID | Category | Finding / Blocker Description | Severity | Verification Status | Mitigation / Required Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BLK-01** | **Configuration** | **Production Secret Validation Fail-Closed**<br>If any of the 5 bootstrap secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `OWNER_PIN_HASH`, `CREDENTIAL_MASTER_KEY`) are missing or using dev defaults, `validateConfig` throws and halts process boot. | **BLOCKER** | **VERIFIED (Code)** | Platform orchestrator (Render/Railway/Docker) must explicitly inject all 5 production credentials prior to container launch. |
| **BLK-02** | **Database** | **Prerequisite PostgreSQL Extensions**<br>Migration 001 and 005 require `uuid-ossp` and `vector` (pgvector). If `CREATE EXTENSION` fails due to restricted database privileges or self-hosted Postgres without pgvector, schema creation aborts. | **BLOCKER** | **VERIFIED (Code)** | Ensure Supabase or PostgreSQL target has `pgvector` enabled before running migrations. |
| **BLK-03** | **Process Architecture** | **Dual Process Runtime Requirement**<br>The system architecture requires two concurrently running Node.js processes: Web API Server (`dist/index.js`) and Background Worker Daemon (`dist/worker/worker.js`). Single-process hosts (e.g. standard Heroku/Render basic web tier) will only run the web server, leaving background jobs stagnant. | **HIGH** | **VERIFIED (Code)** | Use process manager (PM2, Docker Compose, or dual cloud services: 1 Web Service + 1 Background Worker Service). |
| **BLK-04** | **Database Migration** | **Migration Ordering Dependency**<br>Migrations 001 through 005 contain strict foreign key and dependency ordering. Running out of order causes relational constraint violation errors. | **HIGH** | **VERIFIED (Code)** | Apply migrations strictly in order: `001` -> `002` -> `003` -> `004` -> `005`. |
| **BLK-05** | **Frontend Routing** | **Cross-Origin Host Splitting Risk**<br>The frontend PWA uses relative `/api/...` endpoints. If a founder attempts to deploy the frontend to Vercel/Netlify while deploying the backend to Render, all API calls will route to the static host (404) unless an API rewrite or proxy is configured. | **HIGH** | **VERIFIED (Code)** | Preferred: Deploy backend Express which serves static frontend directly from `public/`. If split: Configure Next.js rewrites to backend domain and add domain to `ALLOWED_ORIGINS`. |
| **BLK-06** | **Runtime Code** | **Dead V1 Legacy Files in Repository**<br>`src/lib/groq.ts`, `src/api/voice.ts`, `src/api/auth.ts`, `src/api/chat.ts` read unmanaged `process.env` directly. While unmounted in Express, they pose a maintenance hazard. | **MEDIUM** | **VERIFIED (Code)** | Clean up dead files in post-launch refactoring. |
| **BLK-07** | **Static Assets** | **Next.js Static Export Mirroring**<br>`npm run build` generates assets in `frontend/out/`. The Express backend serves from `public/`. If `public/` is not refreshed after a frontend code change, stale assets are served. | **MEDIUM** | **VERIFIED (Code)** | The root `package.json` build script already handles mirroring (`npm run build:frontend; node scripts/mirror-frontend-export.js; npm run build:backend`). Must ensure CI/CD executes the full composite build script. |
| **BLK-08** | **Dependency Security** | **Next.js Turbopack Advisory Warning**<br>Next.js build displays a non-blocking upgrade advisory for older versions. | **LOW** | **VERIFIED (Build)** | Build succeeds with code 0 (57 pages exported). Plan bump to Next.js latest in next maintenance sprint. |
| **BLK-09** | **PWA Caching** | **Service Worker Stale Cache**<br>`sw.js` caches static resources. When rolling out major production updates, users might need cache invalidation. | **LOW** | **VERIFIED (Code)** | Cache version incrementing script in place (`sw.js`). |

---

## 3. Deep-Dive: Hosting Environment Requirements

### 3.1 Compute Specifications
- **Operating System:** Linux (Ubuntu 22.04 LTS / Alpine 3.19 recommended for Docker) or Windows Server.
- **Node.js:** `>= 20.0.0` (LTS 20 or 22).
- **Memory (RAM):**
  - Web Server: Minimum 512 MB (1 GB recommended).
  - Worker Daemon: Minimum 512 MB (1 GB recommended).
- **Disk:** Minimum 500 MB for Node.js runtime, compiled `dist/`, and static assets in `public/`.

### 3.2 Database Requirements (Supabase / Managed PostgreSQL)
- **Engine:** PostgreSQL `>= 15.0`.
- **Required Extensions:**
  - `uuid-ossp` (for `uuid_generate_v4()`)
  - `vector` (pgvector for semantic RAG document embeddings, 1536 dimensions)
- **RLS & Security Policies:** Migrations define required RLS policies and table constraints.

### 3.3 Network & Firewall
- **Inbound Ports:**
  - Port `3000` (or host HTTP/HTTPS reverse proxy port 80/443).
- **Outbound Connectivity:**
  - `https://*.supabase.co` (Postgres / Supabase API)
  - `https://api.groq.com` (LLM inference)
  - `https://generativelanguage.googleapis.com` (Gemini API)
  - `https://openrouter.ai` (OpenRouter API)
  - `https://api.resend.com` (Transactional email)
  - `https://api.tavily.com` (Web research)
  - `https://api.elevenlabs.io` (Voice TTS client-side)

---

## 4. Production Deployment Verification Verdict

- **Critical Blockers Identified:** 2 (`BLK-01` bootstrap secrets, `BLK-02` pgvector extension).
- **Architecture Readiness:** **HIGH**. The unified Express static serving model eliminates CORS and reverse-proxy complexity when hosted as a single full-stack container.
- **Worker Daemon Decoupling:** Fully functional; can scale independently as a separate worker replica pool.
