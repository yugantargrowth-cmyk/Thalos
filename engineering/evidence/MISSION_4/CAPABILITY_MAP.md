# Mission 4: Knowledge, Memory, RAG & Skills Capability Map

## Overview
This capability map details the data ingestion, memory governance, hybrid retrieval, and DAG workflow execution verified under Mission 4.

| Capability ID | Capability Name | Component / Service | Implementation Status | Verification Evidence |
|---------------|-----------------|---------------------|-----------------------|-----------------------|
| C-M4-01 | Multi-Format Document Ingestion | `src/api/routes/knowledge.ts` | Complete | `tests/api/mission4KnowledgeSkills.test.ts` (accepts PDF/TXT/CSV/DOCX up to 20MB) |
| C-M4-02 | Content-Hash Deduplication | `src/api/routes/knowledge.ts` | Complete | `tests/api/mission4KnowledgeSkills.test.ts` (rejects duplicates with 409 Conflict via SHA-256) |
| C-M4-03 | Hybrid RAG Search (FTS + Vector + RRF) | `src/persistence/ragSearch.ts` | Complete | `tests/api/mission4KnowledgeSkills.test.ts` (combines BM25 and pgvector via Reciprocal Rank Fusion) |
| C-M4-04 | Provenance Verification Rules | `src/persistence/memoryService.ts` | Complete | `tests/api/mission4KnowledgeSkills.test.ts` (`founder_stated` verified at 1.0; `agent_derived` capped & unverified) |
| C-M4-05 | Memory Scope Boundary Enforcement | `src/intelligence/contextAssembler.ts` | Complete | `tests/api/mission4KnowledgeSkills.test.ts` (context assembly filters memories by `allowedScopes`) |
| C-M4-06 | DAG Workflow Definition Validation | `src/execution/workflowRuntime.ts` | Complete | `tests/api/mission4KnowledgeSkills.test.ts` (verifies acyclic DAG and dependency integrity) |
| C-M4-07 | Circular Dependency Trap | `src/execution/workflowRuntime.ts` | Complete | `tests/api/mission4KnowledgeSkills.test.ts` (catches cyclic dependencies via DFS cycle check) |
| C-M4-08 | Reusable Knowledge Research Skill | `database/migrations/002_agents_and_workflows.sql` | Complete | `knowledge_research` DAG: `rag_search` → `web_supplement` → `compile_findings` |
