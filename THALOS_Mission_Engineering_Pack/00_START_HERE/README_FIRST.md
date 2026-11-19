# THALOS Mission Engineering Pack

**Project:** THALOS — Agentic AI Business Operating System for Yugantar Growth  
**Repository baseline:** `Thalos-main.zip`, uploaded 18 November 2026  
**Execution target:** Localhost first; production deployment is explicitly out of scope until separately approved.

## What this pack contains

- One global Master CRISP execution prompt.
- Fifteen mission-specific CRISP prompts:
  - 8 conceptual systems.
  - 6 technical backend layers.
  - 1 final end-to-end integration, verification and evidence mission.
- Product charter and locked decisions.
- Canonical architecture and ownership map to prevent duplicate implementations.
- Repository baseline and known-risk register.
- Acceptance, security, testing, evidence and handoff standards.
- Mission report and defect register templates.

## Important: 15 missions do not mean 15 independent codebases

The 8 conceptual systems and 6 backend layers are two views of the same THALOS product. They overlap by design. The architecture ownership map is mandatory. Technical layers own shared implementation primitives; conceptual system missions verify and complete integrated capabilities without rebuilding those primitives.

## Required execution method

1. Put this ZIP in the repository root and extract it into a folder named `THALOS_ENGINEERING_PACK`.
2. Keep the original repository intact in version control. Create a dedicated branch before implementation.
3. Open `MASTER_CRISP_PROMPT.md` and provide it to Antigravity CLI.
4. Execute only one mission prompt at a time, following `MISSION_EXECUTION_ORDER.md`.
5. At each mission start, tell Antigravity which mission file to read. Do not paste or execute all 15 mission prompts at once.
6. Require a mission report and evidence folder before proceeding.
7. Mission 15 is mandatory and cannot be skipped.

## What “100% complete” means

100% means all mission-specific acceptance criteria have been implemented, tested at the correct levels, integrated with dependent components, security-checked where relevant, documented, and supported by reproducible evidence. It does **not** mean zero bugs can be mathematically guaranteed. It means no known unresolved in-scope defects, no unverified claims presented as facts, and no critical/high-risk issues silently accepted.

## Repository snapshot facts

The uploaded archive contains a TypeScript/Node.js Express backend, six SQL migrations, a single large HTML frontend, nine specialist agent seeds, 25 seeded tools, seven seeded workflow definitions, and nine test files. The 95 test declarations were counted statically; they were not run in this audit. `node_modules` was absent from the archive, so build/test execution was not verified.

The README says “All 45 tests” while the checked-in test sources contain 95 `it()`/`test()` declarations. Antigravity must reconcile this documentation discrepancy and report the actual test count and results.

## Do not do these things

- Do not replace the architecture with microservices.
- Do not introduce n8n or Activepieces unless the founder explicitly approves a documented architecture change.
- Do not add paid APIs as mandatory dependencies. Prefer free/local/self-hostable options where practical.
- Do not invent credentials, successful provider connections, data, test results, screenshots, or database state.
- Do not claim a tool works merely because it exists in a registry.
- Do not claim a workflow works merely because a JSON definition exists.
- Do not make destructive database changes, reset data, rotate credentials, deploy publicly, or send external messages without explicit approval.
- Do not silently expand scope to dedicated website/SEO or HR/team-management modules. These are not part of the initial required module scope.
