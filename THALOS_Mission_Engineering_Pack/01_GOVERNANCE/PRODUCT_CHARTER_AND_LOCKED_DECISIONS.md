# THALOS Product Charter & Locked Decisions

## Product identity

THALOS is the Agentic AI Business Operating System for Yugantar Growth. It is intended to operate as the founder's AI companion and the central operating intelligence for Yugantar Growth and its future portfolio products.

It is not merely a chatbot, CRM, dashboard, or collection of disconnected agents.

## Founder and initial user

- Initial product user: founder only.
- Initial operating context: Yugantar Growth and future businesses/products under its portfolio.
- Localhost-first development.
- Production rollout is a separate later decision.

## Autonomy model

- Routine, low-risk internal work: may execute autonomously within configured permissions.
- Sensitive or externally consequential actions: explicit founder approval.
- Failure behavior: diagnose, retry safely, recover where possible, record useful failure knowledge, and escalate when needed.
- Never claim an action succeeded without verifiable evidence.

## Intelligence and agents

- One central orchestrator.
- Nine existing specialist agents must be preserved and audited against their original intended roles:
  1. THALOS — founder-facing orchestrator.
  2. Scout — prospect discovery.
  3. Hunter — outreach drafting.
  4. Researcher — verification, research and knowledge.
  5. Analyst — metrics and reporting.
  6. Operator — clients, projects and tasks.
  7. Spark — content creation.
  8. Publisher — approved distribution only.
  9. Closer — proposals, invoices and deal progression.
- Agents collaborate or delegate based on task complexity.
- Do not add a second competing agent set or arbitrary agents.
- Preserve configurable prompts, personalities, tools and workflows.

## Business modules in initial scope

1. Lead generation and sales CRM.
2. Client management.
3. Projects, tasks and follow-ups.
4. Marketing and social content operations.
5. Finance, invoices and payment records.
6. Proposals and document generation.
7. Reporting and analytics.
8. Product portfolio management.

Not selected as dedicated initial modules:
- Website development / SEO delivery module.
- HR/team management module.

## Integrations

A central Integrations settings area must support:
- Encrypted credential storage.
- Credential masking.
- Connection testing.
- Permission/scope visibility.
- Provider health and status.
- Error reporting and monitoring.

Do not require routine manual editing of environment files to add provider credentials. Bootstrap secrets/configuration may still be required for secure local startup.

## Knowledge and memory

- Complete evolving memory and knowledge system.
- Hybrid RAG: vector retrieval plus keyword/full-text retrieval.
- Broad document ingestion and continuous knowledge updates from connected sources.
- Memory must distinguish raw conversation, extracted facts, decisions, preferences, business records and source documents.
- Controlled updates, provenance, timestamps, confidence and correction/deletion semantics are required.
- Never turn an LLM-generated guess into a durable fact without provenance or explicit confirmation.

## Frontend

- Immersive AI companion plus practical business control center.
- Core → Environments → Workspaces information architecture.
- Spatial/summonable navigation.
- Unified adaptive PWA across desktop and mobile.
- Landscape-oriented immersive mobile interactions while retaining usable responsive behavior.
- Dark visual direction.
- Do not create separate desktop and mobile products with divergent capabilities.

## Definition of 100%

100% means all agreed in-scope features are:
- Implemented.
- Integrated.
- Tested at appropriate levels.
- Secured.
- Documented.
- Supported by reproducible evidence.
- Free of known unresolved critical/high severity in-scope defects.

It does not mean a mathematically guaranteed absence of all future bugs.
