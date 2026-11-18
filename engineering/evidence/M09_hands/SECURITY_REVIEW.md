# SECURITY REVIEW: MISSION S04 — HANDS

## Security Assessment Summary

1. **Server-Side Authorization & Least Privilege Gating**
   - Tool execution gateway strictly validates server-side:
     - Tool existence and active status.
     - Integration operational status.
     - Agent existence (unregistered agents fail closed).
     - Agent prohibited actions.
     - Agent allowed tools list.
     - User caller authorization (`user_role`).
   - Prevents privilege escalation or bypassing client-side boundaries.

2. **Immutable Approval Policy Enforcement**
   - Sensitive side-effecting tools (`permission_level >= 2` or `requires_approval = true`, such as `send_email`, `send_whatsapp`, `build_invoice`, `create_client`, `export_business_data`) CANNOT execute directly without prior founder approval.
   - Dispatcher inserts a cryptographic SHA-256 payload hash into `approval_queue` and returns `queued_for_approval` pending human review.
   - Payload tampering between request and execution is detected and blocked.

3. **Safe Duplicate Detection & Idempotency**
   - SHA-256 hashes of serialized inputs (`inputs_hash`) are recorded in `tool_executions`.
   - Repeated calls for idempotent operations return cached results (`[Idempotent replay]`), preventing duplicate billing, multiple client creations, or repeated external API mutations.

4. **Fail-Closed Error Handling & No Swallowed Failures**
   - All tool handler exceptions are trapped, audited under `tool.failed`, and returned as explicit error messages with `success: false`.
   - Exceptions are never swallowed, masked as HTTP 200, or converted to partial fake successes.
