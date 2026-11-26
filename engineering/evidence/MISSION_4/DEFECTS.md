# Mission 4: Defects & Remediation Log

| Defect ID | Description | Severity | Remediation | Status |
|-----------|-------------|----------|-------------|--------|
| DEF-M4-01 | Vitest top-level variable reference error in `vi.mock` factory | Low | Switched to `vi.hoisted` to initialize `mockSupabase` before hoisted mock registrations. | Resolved |
| DEF-M4-02 | Missing mock export `processIngestionJob` when mocking `ingestionQueue.js` | Medium | Used `importOriginal` pattern to preserve real exports while selectively overriding `queueIngestionJob`. | Resolved |
| DEF-M4-03 | Supabase query chain mock missing `.order()` method causing TypeError | Low | Updated mock query builder in test to support chained `.order()` calls. | Resolved |
| DEF-M4-04 | Risk of agent hallucinations persisting into permanent memory | High | Verified invariant in `MemoryService.storeMemoryItem`: any `agent_derived` item is forcefully downgraded to `unverified` and confidence is capped at 0.85. | Verified / Protected |
| DEF-M4-05 | Risk of cross-client data leakage in multi-client context windows | Critical | Verified `assembleContext` scope filtering: memories tagged with client-specific scopes are strictly stripped unless explicitly listed in `allowedScopes`. | Verified / Protected |
