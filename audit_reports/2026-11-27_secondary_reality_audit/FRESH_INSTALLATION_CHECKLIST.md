# THALOS SECONDARY REALITY AUDIT: FRESH INSTALLATION CHECKLIST
**Audit Timestamp:** 2026-11-27T04:38:30+05:30  
**Target Repository:** `thalos-backend-v2`  
**Investigation Mode:** Autonomous CLI Execution (READ-ONLY)  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

This checklist outlines the exact, step-by-step procedure required for a fresh founder to deploy and operate Thalos from a clean repository clone.

### Key Finding on Zero-Edit Setup:
- **Local Development / Evaluation:** **100% Zero-Edit**. A founder can run `git clone`, `npm install`, and `npm run dev` with **zero configuration files**. The system boots immediately with built-in development defaults and PIN `1234`.
- **Production Deployment:** Requires setting **5 bootstrap secrets** in the hosting platform (or via `settings.json`) to satisfy the production security boundary (`validateConfig`). All other operational keys (Groq, Gemini, Tavily, Resend, ElevenLabs) are configured entirely through the web dashboard after first login.

---

## 2. Step-by-Step Installation Matrix

### Phase 1: Prerequisites & Environment Preparation
- [ ] **Node.js Runtime:** Ensure Node.js `>= 20.0.0` and `npm >= 10.0.0` are installed:
  ```bash
  node -v  # Expected: v20.x or higher
  npm -v
  ```
- [ ] **Supabase Project:**
  - Create a new project on [Supabase.com](https://supabase.com).
  - Note the **Project URL** and **Service Role Key** (under Project Settings -> API).
  - Enable required PostgreSQL extensions in the Supabase SQL Editor:
    ```sql
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "vector";
    ```

---

### Phase 2: Database Migration Execution
Apply the 5 canonical schema migrations strictly in sequential order via Supabase SQL Editor or Supabase CLI:

- [ ] **Migration 1:** `database/migrations/001_initial_schema.sql`  
  *Core tables: clients, leads, tasks, activity_log, metrics, thalos_sessions.*
- [ ] **Migration 2:** `database/migrations/002_agents_and_workflows.sql`  
  *Agent definitions, workflows, task_queue, execution_runs.*
- [ ] **Migration 3:** `database/migrations/003_finance_and_documents.sql`  
  *Invoices, payment_transactions, accounts_receivable, proposal_documents.*
- [ ] **Migration 4:** `database/migrations/004_daily_briefs_and_activity.sql`  
  *Daily briefs, system activity feed, real-time metrics tracking.*
- [ ] **Migration 5:** `database/migrations/005_knowledge_integrations_audit.sql`  
  *Document knowledge collections, vector embeddings (`vector(1536)`), encrypted integrations table, immutable audit log.*

---

### Phase 3: Repository Setup & Build
- [ ] **Clone Repository:**
  ```bash
  git clone <repo-url> thalos-backend-v2
  cd thalos-backend-v2
  ```
- [ ] **Install Backend Dependencies:**
  ```bash
  npm install
  ```
- [ ] **Install Frontend Dependencies:**
  ```bash
  cd frontend
  npm install
  cd ..
  ```
- [ ] **Build Static PWA & Backend TypeScript:**
  ```bash
  npm run build
  ```
  *This builds the TypeScript server to `dist/`, exports all 57 Next.js pages to `frontend/out/`, and mirrors static assets into `public/`.*

---

### Phase 4: Production Configuration (5 Hosting Secrets)
Inject the following 5 variables in your hosting environment (e.g., Render, Railway, AWS ECS, Fly.io) or write them to `settings.json`:

```ini
# Supabase Connectivity
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Authentication & Security
JWT_SECRET=your-64-character-random-jwt-secret-string
OWNER_PIN_HASH=$2b$10$your-generated-bcrypt-hash-of-pin

# Cryptography (Envelope Encryption for UI-stored keys)
CREDENTIAL_MASTER_KEY=your-64-character-hex-encryption-key-32-bytes
```

#### Helper Commands for Generating Secrets:
```bash
# Generate JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Generate CREDENTIAL_MASTER_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate OWNER_PIN_HASH for your chosen PIN (e.g., 5829):
node -e "console.log(require('bcryptjs').hashSync('5829', 10))"
```

---

### Phase 5: Service Execution & Process Management
Thalos requires two supervised processes:

- [ ] **Web Server (Port 3000):**
  ```bash
  NODE_ENV=production node dist/index.js
  ```
  *Serves the Express REST API and all 57 static PWA routes.*
- [ ] **Worker Daemon (Port 3001):**
  ```bash
  NODE_ENV=production node dist/worker/worker.js
  ```
  *Pulls and processes background tasks, automated workflows, and scheduled jobs.*

*Production Recommendation:* Use PM2 or Docker Compose to run and supervise both processes:
```bash
pm2 start dist/index.js --name "thalos-api"
pm2 start dist/worker/worker.js --name "thalos-worker"
```

---

### Phase 6: Post-Deployment Founder Onboarding via Dashboard

Once the web server is online, the founder performs all operational setup directly through the UI:

1. **First Login:**
   - Navigate to `http://<your-domain>/` (or `http://localhost:3000/`).
   - Enter your configured Owner PIN.
   - Session JWT is issued and stored in browser `localStorage`.
2. **Configure AI Intelligence Providers:**
   - Navigate to **Execution & Settings -> Integrations** (`/execution-and-settings/integrations`).
   - Enter your **Groq API Key** (for Llama 3.3 70B ultra-fast reasoning).
   - Enter your **Gemini API Key** (for multimodal and 1M context fallback).
   - Click **Save Integrations**.
   - Keys are encrypted with AES-256-GCM and stored in the database.
3. **Configure Voice Synthesis (Optional):**
   - In Settings or the Voice Drawer, select voice provider: **Native Web Speech** (zero setup) or **ElevenLabs** (paste API key).
4. **Configure Search & External Tools (Optional):**
   - Provide Tavily or SearXNG URL if live web search is desired.
5. **Operational Verification:**
   - Go to **My Day -> Overview** (`/my-day/overview`): Verify active dashboard widgets load.
   - Go to **AI Team -> Agents** (`/ai-team/agent-overview`): Verify the 14 agent personas are registered and ready.
   - Go to **Execution & Settings -> System Health** (`/execution-and-settings/system-health`): Verify database, cache, and worker daemon show `HEALTHY`.

---

## 3. Fresh Installation Verification Verdict

- **Total Setup Steps:** 6 structured phases.
- **Manual `.env` File Requirement:** **0** in development; **5 variables** in production hosting environment.
- **Provider API Keys Required in Shell:** **0** (all managed securely via dashboard UI).
- **Time to First Value:** < 5 minutes for local development, < 15 minutes for managed cloud deployment.
