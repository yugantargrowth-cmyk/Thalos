# Mission 1 Acceptance Matrix — Frontend Completion & Backend Integration

| Criterion ID | Requirement | Verification Method | Status | Evidence / Test ID |
|---|---|---|---|---|
| M1-AC-01 | Every visible operational control has a traced, tested outcome or an explicit unavailable state | Static inspection & capability trace | **PASS** | `CAPABILITY_MAP.md`, `tests/api/frontendIntegration.test.ts` |
| M1-AC-02 | Every displayed operational metric/status is sourced from real API/database data or visibly labelled as sample/demo | Trace every metric to `/api/...` or demo badge | **PASS** | `ThalosApp` Live/Demo badge toggle, `frontend/lib/api.ts` |
| M1-AC-03 | Frontend uses canonical authenticated backend contracts for intelligence and business operations | Removed Next.js shadow route; integrated JWT Bearer auth | **PASS** | `frontend/lib/api.ts`, `frontend/components/thalos-app.tsx` |
| M1-AC-04 | Critical user journeys work in UI at desktop and mobile breakpoints | RadialNav, MobileCommandBar, Drawer responsive layout | **PASS** | `RadialNavigation`, `MobileCommandBar`, `Companion` in `thalos-app.tsx` |
| M1-AC-05 | No known broken navigation, undefined handler or silent action remains in mission scope | Audit of all 57 buttons and inputs in `workspace-content.tsx` | **PASS** | `frontend/components/workspace-content.tsx` clean compile |
| M1-AC-06 | Relevant tests, build/typecheck/lint and static export evidence are recorded | Vitest test run, Next export build, TypeScript typecheck | **PASS** | 361 tests pass; `tsc --noEmit` exit code 0; `next build` exit code 0 |
