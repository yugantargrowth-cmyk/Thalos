# Mission 2: Companion Capability Map

## Overview
This capability map details the functional and runtime capabilities implemented and verified for Mission 2: Companion Communication, Context & Understanding.

| Capability ID | Capability Name | Component / Service | Implementation Status | Verification Evidence |
|---------------|-----------------|---------------------|-----------------------|-----------------------|
| C-M2-01 | Durable Conversation UUIDs | `src/api/routes/intelligence.ts` | Complete | `tests/api/companionLifecycle.test.ts` (assigns RFC4122 v4 UUIDs) |
| C-M2-02 | Durable Message & User Message UUIDs | `src/api/routes/intelligence.ts` | Complete | `tests/api/companionLifecycle.test.ts` (unique user and assistant IDs) |
| C-M2-03 | Truthful Action Status Flags | `src/intelligence/orchestrator.ts` | Complete | `tests/api/companionLifecycle.test.ts` (`pending_approval`, `completed`, `attempted`, `clarification_needed`, `none`) |
| C-M2-04 | Multi-Turn Context Retention | `src/intelligence/contextAssembler.ts` | Complete | `tests/api/companionLifecycle.test.ts` (consecutive turns with entity resolution) |
| C-M2-05 | Missing Entity / Clarification Guard | `src/intelligence/orchestrator.ts` | Complete | `tests/api/companionLifecycle.test.ts` (detects missing invoice/lead/outreach info and asks targeted questions) |
| C-M2-06 | Offline / Provider Failure Resilience | `src/api/routes/intelligence.ts` | Complete | `tests/api/companionLifecycle.test.ts` (guides founder to settings without session loss) |
| C-M2-07 | Conversation Lifecycle Management | `src/api/routes/intelligence.ts` | Complete | `DELETE /api/intelligence/conversations/:date` verified |
| C-M2-08 | Truthful Voice Support Detection | `frontend/lib/voice.ts` | Complete | `isSpeechRecognitionSupported`, `isSpeechSynthesisSupported` |
