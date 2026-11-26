# 10. Feature Status Matrix

| Module / Feature | Specification | Implementation Path | Status | Verification Evidence |
|------------------|---------------|---------------------|--------|-----------------------|
| **Founder Authentication** | PIN login, JWT token | `src/api/routes/auth.ts` | **Verified working** | `tests/api/mission5FinalAcceptance.test.ts` |
| **Companion Chat** | UUID message tracking, honest action status | `src/api/routes/intelligence.ts`, `src/intelligence/orchestrator.ts` | **Verified working** | `tests/api/companionLifecycle.test.ts` |
| **Clarification Guard** | Missing entity question prompt | `src/intelligence/orchestrator.ts` | **Verified working** | `tests/api/companionLifecycle.test.ts` |
| **9 Specialist Agents** | Exact 9 canonical agents | `src/intelligence/agentService.ts` | **Verified working** | `tests/api/mission3BusinessExecution.test.ts` |
| **Server-Side Approvals**| Outbound messages & invoices require approval | `src/execution/toolDispatcher.ts` | **Verified working** | `tests/api/mission3BusinessExecution.test.ts` |
| **CRM Leads & Clients** | Lead creation, stage progression, deduplication | `src/api/routes/leads.ts`, `src/business/crmService.ts` | **Verified working** | `tests/api/mission5FinalAcceptance.test.ts` |
| **Invoicing & Payments** | Invoices, decimal math, payment UTR check | `src/api/routes/finance.ts`, `src/business/financeService.ts` | **Verified working** | `tests/api/mission5FinalAcceptance.test.ts` |
| **Document Ingestion** | Multi-format upload, SHA-256 deduplication | `src/api/routes/knowledge.ts` | **Verified working** | `tests/api/mission4KnowledgeSkills.test.ts` |
| **Hybrid RAG Retrieval** | BM25 FTS + pgvector + RRF | `src/persistence/ragSearch.ts` | **Verified working** | `tests/api/mission4KnowledgeSkills.test.ts` |
| **Memory Isolation** | Scope boundary enforcement | `src/intelligence/contextAssembler.ts` | **Verified working** | `tests/api/mission4KnowledgeSkills.test.ts` |
| **Worker Queue Telemetry**| Queue metrics, dead-letter replay | `src/api/routes/system.ts`, `src/worker/worker.ts` | **Verified working** | `tests/api/mission5FinalAcceptance.test.ts` |
| **SSRF Defense** | Private IP & AWS metadata blocking | `src/security/ssrf.ts` | **Verified working** | `tests/security/ssrf.test.ts` (26 tests) |
| **Static PWA Dashboard** | 57 SSG/Static pages in public/ | `frontend/components/thalos-app.tsx` | **Verified working** | `npm --prefix frontend run build` (57 pages) |
| **n8n Automation** | External automation workflows | `src/execution/toolDispatcher.ts` | **Mock / By Design** | Clean disabled stub throws error |
| **Physical Mic Input** | Microphone audio stream capture | `frontend/lib/voice.ts` | **Blocked (Hardware)** | Browser Web Speech fallback verified |
