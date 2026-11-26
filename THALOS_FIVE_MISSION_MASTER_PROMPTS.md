# THALOS --- Five-Mission Completion Programme

**For:** Antigravity CLI\
**Project:** THALOS --- Agentic AI Business Operating System for
Yugantar Growth\
**Product direction:** Hybrid companion + business command centre;
communication and business execution are equally important.\
**Execution rule:** Five coordinated mission phases, executed
sequentially---not one giant unattended run.

------------------------------------------------------------------------

## How to use this file

1.  Open Antigravity CLI at the **root of the latest THALOS
    repository**.
2.  Confirm the latest repository is backed up or committed, then create
    a dedicated feature branch.
3.  Ensure the existing `THALOS_ENGINEERING_PACK/` folder is present.
    The latest supplied repository ZIP already contains this pack.
4.  Read the **Shared Instructions** below.
5.  Copy and run **Mission 1 only**.
6.  Review its report, evidence, changed files and tests. Fix or
    explicitly accept blockers before running Mission 2.
7.  Repeat in order through Mission 5. Do not paste all five missions as
    one request.

These prompts are designed to guide Antigravity through the work. They
do not replace the repository, credentials, local runtime, database, or
required provider connections.

------------------------------------------------------------------------

# Shared Instructions --- Apply to all five missions

You are the principal engineer responsible for completing the existing
THALOS product. Work in the current repository; do not start a rewrite.

## Source of truth

Before changing code, read and obey these existing project documents:

-   `THALOS_ENGINEERING_PACK/00_START_HERE/MASTER_CRISP_PROMPT.md`
-   `THALOS_ENGINEERING_PACK/01_GOVERNANCE/PRODUCT_CHARTER_AND_LOCKED_DECISIONS.md`
-   `THALOS_ENGINEERING_PACK/01_GOVERNANCE/ACCEPTANCE_AND_QUALITY_STANDARD.md`
-   `THALOS_ENGINEERING_PACK/01_GOVERNANCE/SECURITY_AND_APPROVAL_POLICY.md`
-   `THALOS_ENGINEERING_PACK/02_ARCHITECTURE/CANONICAL_ARCHITECTURE.md`
-   `THALOS_ENGINEERING_PACK/02_ARCHITECTURE/CANONICAL_OWNERSHIP_MAP.md`
-   `THALOS_ENGINEERING_PACK/02_ARCHITECTURE/MISSION_EXECUTION_ORDER.md`
-   `THALOS_ENGINEERING_PACK/03_BASELINE/INITIAL_DEFECT_AND_RISK_REGISTER.md`
-   `THALOS_ENGINEERING_PACK/03_BASELINE/REPOSITORY_BASELINE_2026-11-18.md`

Also inspect relevant existing mission prompts under: -
`THALOS_ENGINEERING_PACK/04_MISSION_PROMPTS/`

The baseline report is a historical static inspection, not proof of the
current state. Re-check every finding against the current working tree.
The repository may have changed since that snapshot.

## Locked product direction

THALOS must become both: 1. A natural, persistent, founder-facing AI
companion; and 2. A practical business command centre for Yugantar
Growth.

Use one unified adaptive application and the agreed Core → Environments
→ Workspaces information architecture. Keep the immersive/summonable
navigation direction while ensuring ordinary tasks remain easy to
discover and operate. The companion must be present throughout the
experience; business controls must remain accessible rather than hidden
behind chat alone.

Preserve the existing API-first modular monolith, Express/TypeScript
backend, PostgreSQL/Supabase persistence, pgvector + full-text hybrid
retrieval, independent background worker, central tool dispatcher,
approval enforcement and nine existing specialist agents. Do not create
competing versions of these systems.

## Mandatory engineering rules

-   Inspect first; write a short plan and acceptance checklist before
    implementation.
-   Preserve existing user changes. Never overwrite uncommitted work.
-   Work only on the current mission. Do not silently start later
    missions.
-   Do not invent credentials, data, test output, provider status or
    successful actions.
-   Distinguish `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED` and
    `NOT APPLICABLE`.
-   A registered tool is not a working tool. A UI button is not proof of
    execution. A passing mock is not a live integration test.
-   Do not use demo/fallback values as real business metrics or online
    statuses.
-   Do not expose secrets in code, logs, screenshots or reports.
-   Do not reset databases, delete user data, rotate credentials, send
    external messages, publish content, issue invoices, make financial
    commitments, deploy publicly or change DNS without explicit founder
    approval.
-   Do not introduce paid mandatory services, microservices, n8n or
    Activepieces without an approved written architecture change.
-   Use bounded retries. After three unsuccessful attempts at the same
    root cause, stop and report the evidence, root cause, options and
    recommended decision.
-   Run the checks actually available in the environment. If a live
    check is blocked by missing credentials or infrastructure, report it
    as blocked---not passed.
-   Update tests and documentation for every material change.

## Required deliverables for every mission

Create an evidence folder:

`engineering/evidence/MISSION_1/` (use the relevant mission number)

Include: - `MISSION_REPORT.md` - `ACCEPTANCE_MATRIX.md` -
`TEST_RESULTS.md` - `DEFECTS.md` - `CHANGES.md` - `SECURITY_REVIEW.md`
where relevant - actual screenshots / logs / machine-readable outputs
where relevant

The report must include starting commit and working-tree state, files
inspected/changed, commands and exit codes, test counts, skipped checks,
evidence paths, remaining risks and a final status. Never claim more
than the evidence proves.

A mission is complete only when its acceptance criteria pass with
reproducible evidence, or it is explicitly marked blocked with a precise
explanation. Stop after reporting the current mission.

------------------------------------------------------------------------

# Mission 1 --- Frontend Completion & Backend Integration

**Goal:** Turn the existing frontend into the real, usable control
surface for the capabilities already implemented in THALOS.

### Master prompt

Read all Shared Instructions and the relevant architecture, ownership
and frontend mission documents. Then inspect the entire current frontend
and trace every visible page, navigation item, button, form, metric,
status and action to its actual API/service/data source.

Do not begin by redesigning everything. First produce a frontend
capability map with these columns:

`UI location | user action | current handler | API/service called | data source | auth/permission | status | gap`

Identify: - Pages/workspaces that exist only as shells, placeholders or
demo screens. - Buttons and controls with missing, undefined or inert
handlers. - Frontend features that use local storage when they should
use the canonical backend/database. - Hardcoded metrics, sample records
and fabricated status indicators. - Backend capabilities that have no
discoverable UI entry point or natural-language trigger. - Duplicate or
competing frontend/backend implementations. - Accessibility, responsive
and mobile usability issues.

Pay special attention to the existing finding that the frontend may call
a separate Next.js chat endpoint instead of the canonical Express
intelligence/orchestrator path. Verify the current code and correct the
architecture so there is one authenticated, policy-enforced canonical
path. Do not assume this historical finding remains true without
checking.

Implement the smallest coherent set of changes needed to make the
frontend a real control surface: - Connect existing pages to real
API-backed data. - Connect every in-scope visible control to a real
action or clearly mark it unavailable with a reason. - Add missing
navigation and workspace entry points for existing backend
capabilities. - Provide useful loading, empty, success, error and
permission states. - Ensure frontend authentication and authorization
match backend contracts. - Remove misleading demo/fallback data from
operational views. - Keep the hybrid companion + command-centre
experience and adaptive desktop/mobile PWA direction. - Do not create a
page merely to duplicate an existing capability; use the canonical
ownership map.

### Acceptance gate

PASS only when: 1. Every visible operational control has a traced,
tested outcome or an explicit unavailable state. 2. Every displayed
operational metric/status is sourced from real API/database data or
visibly labelled as sample/demo. 3. The frontend uses canonical
authenticated backend contracts for intelligence and business
operations. 4. Critical user journeys work in browser/UI tests at
desktop and mobile breakpoints. 5. No known broken navigation, undefined
handler or silent action remains in the mission scope. 6. Relevant
tests, build/typecheck/lint and browser evidence are recorded.

Stop after Mission 1 and report. Do not start Mission 2.

------------------------------------------------------------------------

# Mission 2 --- Companion Communication, Context & Understanding

**Goal:** Make THALOS feel like a coherent, natural, persistent business
companion---not a stateless prompt box.

### Master prompt

Read all Shared Instructions and inspect the actual chat, intelligence,
orchestrator, model-router, conversation persistence, context assembly,
agent handoff and voice code. Trace one user message from the frontend
through the canonical backend and back to the rendered response.

Design and implement a reliable conversation lifecycle with: - Durable
conversation and message IDs. - Correct conversation history supplied to
the canonical orchestrator. - Session continuity across refreshes and
devices where supported by the current architecture. - Context assembly
that retrieves relevant recent turns, active tasks, confirmed founder
preferences, business context and relevant knowledge without blindly
stuffing the entire history into every prompt. - Clear separation
between user statements, verified facts, decisions, assumptions,
retrieved source material and model-generated suggestions. - Follow-up
understanding: pronouns, references such as "that lead", corrections,
unfinished tasks and multi-turn instructions. - Clarifying questions
when required information is genuinely missing. - Streaming or
responsive progress feedback where supported by the existing stack. -
Cancellation, timeout, retry and recoverable error handling. -
Consistent THALOS voice/personality while preserving specialist-agent
identities. - Truthful reporting: THALOS must distinguish a plan, a
pending approval, an attempted action and a verified completed action.

Inspect voice controls and speech input/output. Make them functional
only where the underlying browser/device and provider capabilities
support them. Do not display a working voice state when the feature is
unavailable.

Do not build a separate chatbot or duplicate the orchestrator. Improve
the canonical conversation and intelligence path. Do not silently make
inferred details permanent memory.

### Acceptance gate

PASS only when: 1. A multi-turn conversation retains the correct context
across at least a refresh/reopen test. 2. Follow-up references and
corrections are handled in repeatable tests. 3. The same canonical
orchestration path is used by the companion UI and relevant API clients.
4. Conversation persistence, retrieval and authorization are tested. 5.
Errors, timeouts and cancellation are handled without corrupting
conversation state. 6. A set of realistic founder scenarios demonstrates
coherent responses and truthful action status. 7. Voice capabilities are
accurately represented and tested where available.

Stop after Mission 2 and report. Do not start Mission 3.

------------------------------------------------------------------------

# Mission 3 --- Business Partner, Agents, Tools & Real Execution

**Goal:** Make THALOS able to perform real Yugantar business work
through its existing agents and tool architecture.

### Master prompt

Read all Shared Instructions and inspect the canonical tool registry,
schemas, dispatcher, permission engine, approval queue/executor, worker,
workflow runtime, all nine seeded agents, business services,
integrations and relevant frontend controls.

Preserve the nine agents and their intended roles: - THALOS ---
founder-facing orchestrator. - Scout --- prospect discovery. - Hunter
--- outreach drafting. - Researcher --- verification, research and
knowledge. - Analyst --- metrics and reporting. - Operator --- clients,
projects and tasks. - Spark --- content creation. - Publisher ---
approved distribution only. - Closer --- proposals, invoices and deal
progression.

Build a capability-to-execution matrix:

`Agent | intended responsibility | assigned tools | permission scope | workflow | actual handler | persistence/result | test evidence`

For every seeded tool and workflow, determine whether it is: -
Implemented and executable. - Implemented but not connected. - Needs
configuration/credentials. - Intentionally unavailable or out of initial
scope. - Broken or misleadingly labelled.

Trace each tool end to end: UI/chat request → intent/agent selection →
schema validation → authorization/approval → dispatcher →
handler/provider → durable result → audit/evidence → user-visible
report.

Fix confirmed gaps in tool contracts, handler mappings, worker job
types, retries, idempotency, timeouts, result persistence and error
reporting. Do not inflate tool counts by adding fake handlers. Preserve
optional integrations as optional. Use real connection tests only when
valid credentials are available.

Make the business modules usable for the agreed initial scope: - Lead
generation and sales CRM. - Clients. - Projects, tasks and follow-ups. -
Marketing and social content operations. - Finance, invoices and payment
records. - Proposals and documents. - Reporting and analytics. - Product
portfolio management.

Use the canonical database and domain services. Ensure agents can
collaborate/delegate through the central orchestrator without creating a
second agent framework.

Enforce founder approval server-side for outbound messages, publishing,
invoices/payments/refunds, pricing/contract commitments, destructive
actions, credential rotation and public deployment. Approval must bind
to the exact action/payload and be atomic, single-use, auditable and
revalidated at execution time.

### Acceptance gate

PASS only when: 1. Every in-scope tool has a truthful capability status
and validated contract. 2. Each tool marked executable has a real
handler and an integration test of application-owned behavior. 3.
Worker-backed jobs complete, fail or retry with durable, truthful
states. 4. At least one end-to-end business scenario works for lead
research/CRM, one for client/project operations and one for a
founder-approved external action in a safe test environment. 5. Agent
delegation is evidenced, not inferred from agent definitions. 6.
Sensitive actions cannot bypass server-side approval. 7. Results and
failures are persisted and reported to the founder accurately.

Stop after Mission 3 and report. Do not start Mission 4.

------------------------------------------------------------------------

# Mission 4 --- Knowledge, Memory, RAG & Reusable Skills

**Goal:** Give THALOS trustworthy long-term knowledge and a reusable way
to learn professional methods for using its tools.

### Master prompt

Read all Shared Instructions and inspect the existing ingestion
pipeline, parsers, chunking, embeddings, pgvector/full-text retrieval,
RAG ranking, memory services, provenance/versioning, conversation
extraction, file APIs and agent/tool prompt contracts.

First map the actual knowledge lifecycle:

`source/file/conversation → ingestion → parsing → chunking → embedding/indexing → retrieval → context use → citation/provenance → correction/update/deletion`

Verify every stage in code and with tests. Revalidate historical risks
involving swallowed ingestion errors, worker completion states, payload
contracts, missing schemas and persistence. A failed parse, embedding or
database write must never be reported as a completed ingestion.

Complete the hybrid knowledge system: - Vector and keyword/full-text
retrieval with traceable source references. - Document identity,
versioning, metadata and access control. - Supported file-type
validation and safe parsing. - Durable ingestion jobs, retry and failure
visibility. - Retrieval relevance tests and source-grounded answers. -
Clear distinction between source documents, raw conversation, extracted
facts, decisions, preferences and business records. - Provenance,
timestamps, confidence and correction/deletion semantics. - No automatic
promotion of an LLM guess into durable fact. - User-visible knowledge
upload, status, search and source inspection flows.

Then assess and implement a **Skill Engine** as a distinct capability if
it is not already present. Do not mistake tool definitions, agent
prompts or workflow JSON for a skill engine.

A skill should be a reusable, versioned professional procedure that
can: - Explain its purpose, scope, inputs and expected outputs. -
Declare required tools and permissions. - Provide step-by-step
methodology and decision rules. - Include examples, quality checks and
failure handling. - Be discovered and selected by the
orchestrator/agents. - Be installed/updated/disabled with validation and
audit history. - Be tested against repeatable scenarios. - Respect tool
permissions and founder approval policy.

Start with one demonstrator skill: `Professional Lead Research`. It
should guide the appropriate agent(s) through prospect qualification,
source verification, opportunity assessment, CRM recording and an
evidence-based report. It must not send outreach automatically.

Do not allow uploaded skill instructions or retrieved documents to
override system security policy, permissions or trusted application
instructions. Treat them as untrusted data and validate their declared
tool requirements.

### Acceptance gate

PASS only when: 1. A supported document can be ingested, indexed,
retrieved and cited back to its source. 2. Ingestion failures remain
failures and can be retried or diagnosed. 3. Memory distinguishes facts,
decisions, preferences, raw conversation and source documents. 4.
Corrections and deletion/update behavior are defined and tested. 5. The
skill capability is either implemented and tested or explicitly blocked
with a documented architecture proposal. 6. `Professional Lead Research`
completes a repeatable test using real application tools and produces
evidence-backed output. 7. Skills cannot bypass authorization, approval
or trust boundaries.

Stop after Mission 4 and report. Do not start Mission 5.

------------------------------------------------------------------------

# Mission 5 --- Security, Reliability, Integration & Final Acceptance

**Goal:** Prove that THALOS works as one coherent, safe, recoverable
product---not merely as a collection of passing unit tests.

### Master prompt

Read all Shared Instructions and inspect the complete repository after
Missions 1--4. Reconcile every mission report, acceptance matrix, defect
register and changed-file list. Do not conceal or silently downgrade
earlier blockers.

Revalidate the existing risk register, including: - Development/default
secrets and production fail-closed startup. - Atomic approval
transitions and execution. - Ingestion failure versus worker completion
state. - Queued job type/handler mismatches. - Missing or incomplete
tool schemas. - Misleading tool-to-handler mappings. - Provider-specific
orchestration/tool-call coupling. - Worker concurrency, leases and
recovery. - Undefined frontend handlers and hardcoded metrics. -
XSS-safe rendering and untrusted HTML/data. - SSRF controls for DNS,
private IPv4/IPv6, redirects and rebinding. - README/test-count
discrepancies. - Missing live database/provider/E2E evidence.

Perform security verification appropriate to the actual application: -
Authentication and authorization across routes and tools. -
Least-privilege agent/tool scopes. - Secret encryption, masking and
redacted logs. - Input validation and output encoding. - XSS, CSRF,
SSRF, injection, path traversal and upload handling. - Rate limiting,
CORS, security headers and CSP. - Approval integrity, replay prevention
and idempotency. - Audit-log integrity. - Backup and restore testing
where the environment permits.

Perform reliability and integration testing: - Build, typecheck, lint
and all relevant test suites. - API/database/worker contract tests. -
Browser/UI tests at desktop and mobile sizes. - Restart/reopen and
durable-state tests. - Job retry, timeout, crash/recovery and
duplicate-execution tests. - RAG ingestion/retrieval tests. - Agent
delegation and tool execution tests. - Real provider/database checks
only with valid configured credentials. - Performance checks for core
conversation and business workflows where practical.

Run a final founder workflow using the real application: 1. Open THALOS
and receive or request a daily briefing. 2. Discuss a current Yugantar
business priority over multiple turns. 3. Ask THALOS to research and
qualify a prospect. 4. Verify evidence and save the lead to the real
CRM. 5. Ask an agent to prepare a follow-up draft without sending it. 6.
Review a task/project and create or update a permitted internal task. 7.
Upload a knowledge document and retrieve a source-grounded answer. 8.
Invoke the Professional Lead Research skill. 9. Attempt a sensitive
action and prove it is blocked pending explicit founder approval. 10.
Restart/reopen the application and verify durable conversation, business
and job state.

Use safe test data and test accounts. Do not contact real prospects or
perform real financial/public actions. If a required provider or
credential is unavailable, mark that scenario BLOCKED or NOT VERIFIED.

Fix confirmed in-scope critical/high defects. Produce a final system
acceptance report with: - Mission-by-mission status. - Complete defect
register with severity and disposition. - Exact test counts, commands
and exit codes. - Security findings and residual risks. - Live
integration status by provider. - E2E scenario results. - Backup/restore
evidence or explicit blocker. - Known limitations and founder decisions
still required. - A clear operational runbook for starting, stopping,
configuring and troubleshooting THALOS.

### Final acceptance gate

THALOS may be declared ready for daily founder use only when: 1.
Companion communication uses the canonical authenticated intelligence
path. 2. Core business operations use real persistent data. 3.
Agent/tool execution and approvals are proven end to end. 4. Knowledge
retrieval is source-grounded and durable. 5. The skill demonstrator
works without bypassing policy. 6. Critical/high security and
reliability defects are fixed or explicitly block release. 7. Desktop
and mobile core journeys pass. 8. The founder workflow is reproducible
and supported by evidence. 9. Startup/build/test instructions are
accurate. 10. No `BLOCKED` or `NOT VERIFIED` item is represented as
`PASS`.

If any release-critical criterion is blocked, report THALOS as **NOT
READY FOR DAILY USE**, explain the exact blocker and provide the
shortest safe remediation plan. Do not claim 100% completion.

Stop after the final report and wait for founder review.

------------------------------------------------------------------------

# What must be attached or available to Antigravity?

## Required

1.  **Latest THALOS repository** --- the current working directory
    opened in Antigravity. Do not merely give it this prompt file
    without the code.
2.  **`THALOS_ENGINEERING_PACK/`** --- already included in the latest
    supplied `Thalos-main (3).zip`. Keep it in the repository root so
    Antigravity can read the source-of-truth documents.

## Useful, if available

-   Latest `DEFECTS.md` / defect register.
-   Latest engineering audit or mission report.
-   Current `.env.example` (safe template only; never attach real `.env`
    or API keys).
-   Sanitized logs for current startup, build, API or browser errors.
-   Screenshots or a short screen recording of the current frontend pain
    points.
-   Test database instructions and test-only credentials supplied
    through Antigravity's secure local environment---not pasted into
    prompts or committed files.

## Do not attach

-   Real `.env` files, API keys, passwords, JWT secrets, encryption keys
    or owner PINs.
-   Production database dumps containing personal/customer data.
-   Unredacted customer conversations, invoices or private records.
-   A second/older repository ZIP unless you explicitly need a
    comparison.

## Is this prompt file enough?

**No---not by itself.** It tells Antigravity what to do; the repository
and engineering pack tell it what exists and what must be preserved.
Credentials and live services are needed only for the tests that depend
on them.

The latest repository ZIP already contains a substantial 15-mission
engineering pack. This five-mission programme is an outcome-focused
execution layer over that pack---not a replacement for its governance,
architecture, ownership rules or evidence standards. Antigravity must
use the existing technical ownership map and relevant original mission
prompts to avoid duplicating backend primitives.

**Recommended first CLI instruction:**

> Read `THALOS_FIVE_MISSION_MASTER_PROMPTS.md` completely, then read its
> Shared Instructions and all referenced source-of-truth documents.
> Inspect the current repository and working tree. Execute Mission 1
> only. Do not start Mission 2 or make destructive/external changes.
> Produce the required evidence and stop for founder review.
