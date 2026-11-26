# 01. Repository & Architecture Audit

## 1. Repository Identity & Working Tree State
- **Workspace Root:** `D:\thalos-backend-v2`
- **Git Remote Origin:** `https://github.com/yugantargrowth-cmyk/Thalos.git`
- **Active Branch:** `feature/five-mission-completion`
- **Current HEAD Commit:** `23911a66a7a2962ed77f409e6bd7d2b87fb1cdbf`
- **Node Version:** `v24.15.0` | **npm Version:** `11.12.1`
- **Working Tree Analysis:**
  - Modified: `src/api/routes/intelligence.ts`, `src/intelligence/orchestrator.ts`, `src/intelligence/contextAssembler.ts`, `src/api/routes/system.ts`, `src/api/routes/integrations.ts`, `frontend/components/thalos-app.tsx`, `frontend/components/workspace-content.tsx`, `frontend/lib/voice.ts`, `frontend/next.config.mjs`, `public/*`.
  - Added Untracked: `frontend/lib/api.ts`, `tests/api/*.test.ts`, `engineering/evidence/MISSION_*`, `THALOS_FIVE_MISSION_MASTER_PROMPTS.md`.
  - Deleted Shadow Files: `api/intelligence/chat.ts`, `frontend/app/api/intelligence/chat/route.ts`.

---

## 2. Architecture Map & Component Topology

```mermaid
graph TD
  Client[Browser / PWA Client] -->|Bearer JWT + HTTPS| Express[Express 5 Server :3000]
  Express --> AuthMid[Auth Middleware & Rate Limiter]
  AuthMid --> IntelRoutes[/api/intelligence]
  AuthMid --> CRMRoutes[/api/leads, /api/clients]
  AuthMid --> ApprRoutes[/api/approvals]
  AuthMid --> FinRoutes[/api/finance]
  AuthMid --> KnowRoutes[/api/knowledge]
  AuthMid --> SysRoutes[/api/system]
  
  IntelRoutes --> Orch[THALOS Orchestrator]
  Orch --> CtxAsm[Context Assembler + Scope Filter]
  Orch --> LLM[Normalized LLM Client Groq/Gemini]
  Orch --> Dispatcher[Tool Dispatcher]
  
  Dispatcher --> PermCheck{Allowed Tools?}
  PermCheck -->|No| Reject[Permission Denied]
  PermCheck -->|Yes| ApprCheck{Requires Approval?}
  ApprCheck -->|Yes| ApprQueue[(approval_queue Table)]
  ApprCheck -->|No / Approved| ToolHandler[Tool Handlers]
  
  ToolHandler --> DB[(Supabase PostgreSQL + pgvector)]
  ToolHandler --> ExtNet[External Web / APIs Safe SSRF]
  
  SysRoutes --> WorkerQueue[(jobs Table)]
  Worker[Background Worker :3001] -->|Poll & Claim| WorkerQueue
  Worker --> Ingestion[Document Parser & Chunker]
  Ingestion --> DB
```

---

## 3. Request Path Verification: Companion Chat (`POST /api/intelligence/chat`)
1. **User Action:** User inputs message in React dashboard Companion chat widget.
2. **Frontend Dispatch:** `chatWithThalos({ message })` in `frontend/lib/api.ts` retrieves JWT from `localStorage` (`thalos_auth_token`), attaches `Authorization: Bearer <token>`, and issues POST request.
3. **Express Boundary:** Express router matches `POST /api/intelligence/chat`, validates schema (`body('message').isLength({ min: 1, max: 8000 })`).
4. **Auth Enforcement:** `requireAuth` verifies JWT signature against `JWT_SECRET`.
5. **Durable Tracking:** Assigns RFC 4122 v4 UUIDs for user turn (`user_message_id`) and conversation (`conversation_id`).
6. **Context Assembly:** `assembleContext` loads recent history, filters memories by scope, prunes tokens to fit budget, and prevents prompt duplication.
7. **Orchestrator Reasoning:** `thalosOrchestrate` classifies intent, selects specialist agent, and evaluates required tool calls.
8. **Approval Gating:** If a tool requires founder approval (`send_email`, `build_invoice`), execution halts, payload is hashed, and record is created in `approval_queue`.
9. **Response Delivery:** Returns JSON payload with `conversation_id`, `message_id`, `user_message_id`, `response`, `action_status`, and `actions_taken`.
10. **State Persistence:** Conversation history upserted to `conversations` table in Supabase (with in-memory fallback).
