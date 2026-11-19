# Security, Permissions & Approval Policy

## Trust boundaries

Treat all of the following as untrusted:
- Founder text and uploaded files.
- Retrieved web pages and search results.
- LLM outputs and tool arguments.
- External provider responses and webhooks.
- Browser input and URL parameters.
- Database records created by previous untrusted ingestion.

## Required controls

- Strict input validation and output encoding.
- Server-side authorization on every sensitive route and tool.
- Least-privilege agent and tool scopes.
- Encrypted credentials at rest; keys loaded securely and never committed.
- Production startup fails closed when required secrets are missing, weak or default.
- Rate limiting and abuse controls.
- CSRF protection where cookie-based auth is used.
- Secure CORS policy.
- Security headers and CSP appropriate to the actual frontend.
- SSRF protection across DNS resolution, IP address validation, redirects and IPv4/IPv6.
- File upload limits, MIME/content verification, path isolation and parser hardening.
- SQL parameterization and safe query construction.
- XSS-safe rendering; avoid raw HTML insertion of untrusted data.
- Redacted structured logs.
- Append-only audit events for privileged actions.
- Backup encryption and restore testing.

## Approval-required actions

Require explicit founder approval for:
- Sending email, WhatsApp or outbound messages.
- Publishing content.
- Issuing invoices, recording payments, refunds or financial commitments.
- Commercial pricing, discounts, contract terms or commitments.
- Destructive operations and bulk deletion.
- Credential rotation.
- Public deployment, domain/DNS changes or internet exposure.
- Other material external/legal/financial consequences.

Approval must be:
- Bound to a specific action and immutable payload/hash.
- User- and timestamp-attributed.
- Expiring where appropriate.
- Single-use and concurrency-safe.
- Revalidated at execution time.
- Audited before and after execution.
- Idempotent against duplicate requests.
- Reflected truthfully in UI and API response.

A frontend confirmation dialog is not a security control. The backend must enforce the policy.
