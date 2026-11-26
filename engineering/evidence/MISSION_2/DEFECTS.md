# Mission 2: Defects & Remediation Log

| Defect ID | Description | Severity | Remediation | Status |
|-----------|-------------|----------|-------------|--------|
| DEF-M2-01 | Lack of unique UUIDs on messages in `conversations.messages` JSONB array | High | Added `uuidv4()` generation for user message and assistant message, returning `conversation_id`, `message_id`, and `user_message_id`. | Resolved |
| DEF-M2-02 | Potential duplicate user turn in context assembly | Medium | Added deduplication check in `src/intelligence/contextAssembler.ts` to exclude immediate user turn from history if identical to prompt. | Resolved |
| DEF-M2-03 | Missing entity parameter requests caused premature failures or hallucinated details | High | Added `checkMissingRequiredInfo` guard in `src/intelligence/orchestrator.ts` to ask clarifying questions with `action_status: 'clarification_needed'`. | Resolved |
| DEF-M2-04 | Express 5 `req.params.date` type ambiguity (`string | string[]`) causing typecheck error | Low | Added Array.isArray check and explicit normalization in `DELETE /api/intelligence/conversations/:date`. | Resolved |
| DEF-M2-05 | Web Speech API detection missing programmatic verification helper in frontend | Low | Exported `isSpeechRecognitionSupported` and `isSpeechSynthesisSupported` in `frontend/lib/voice.ts`. | Resolved |
