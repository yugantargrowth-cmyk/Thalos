# 05. Integrations & Automation Audit

## 1. Provider Inventory & Credential Vaulting

| Provider / Service | Integration Target | Credential Key | Storage Mechanism | Status |
|--------------------|--------------------|----------------|-------------------|--------|
| **Groq** | LLM Inference (Llama 3.3 70B) | `GROQ_API_KEY` | Server Vault (AES-256-GCM) / `.env` | **Verified working** |
| **Google Gemini** | Multimodal / Quality LLM | `GEMINI_API_KEY` | Server Vault (AES-256-GCM) / `.env` | **Verified working** |
| **OpenRouter** | Fallback LLM Gateway | `OPENROUTER_API_KEY` | Server Vault (AES-256-GCM) / `.env` | **Code-supported** |
| **Supabase** | PostgreSQL, pgvector, Auth | `SUPABASE_SERVICE_ROLE_KEY` | Environment variable | **Verified working** |
| **ElevenLabs** | Voice Synthesis (Rachel / Custom) | `ELEVENLABS_API_KEY` | Browser / Settings | **Code-supported** |
| **n8n / Activepieces** | Automation Engine | `N8N_WEBHOOK_URL` | Disabled declared adapter stub | **Mock / Placeholder** |

---

## 2. Credential Security in Server Vault (`src/lib/vault.ts`)
- Credentials stored via `POST /api/integrations/settings` are encrypted using AES-256-GCM authenticated encryption with a PBKDF2-derived key from `CREDENTIAL_MASTER_KEY`.
- Decryption occurs only at point-of-use during provider execution; raw API keys are never exposed in logs, client responses, or audit records.

---

## 3. Workflow Automation Runtime (`src/execution/workflowRuntime.ts`)
- Implements a directed acyclic graph (DAG) execution engine for multi-step skills.
- Cycle Detection: Depth-first search (DFS) with 3-color node tracking detects and rejects circular dependencies.
- 7 Seeded Workflows Verified:
  1. `lead_discovery` (Scout → Researcher → Analyst → THALOS)
  2. `outreach` (Hunter Draft → Approval Gate → Dispatch → Log Activity)
  3. `deal_progression` (Closer Qualify → Proposal → Approval → Dispatch → Outcome)
  4. `client_onboarding` (Client → Project → Tasks → Progress → Verification)
  5. `content_pipeline` (Research → Create → Approval → Distribute → Verify)
  6. `business_intelligence` (Analyst Query → Prioritization)
  7. `knowledge_research` (RAG Search → Web Supplement → Compile Findings)
