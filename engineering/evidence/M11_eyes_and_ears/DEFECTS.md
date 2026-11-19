# DEFECTS LOG: S03 — Eyes & Ears (Mission 11)

## Detected Defect 1: ESM Default Export Mocking in Unit Tests
- **Description**: `vi.spyOn(await import('node-fetch'), 'default')` threw `TypeError: Cannot redefine property: default` because module namespace objects are immutable in Node.js ESM.
- **Root Cause**: Direct spying on third-party default exports is prohibited by ESM specifications.
- **Resolution**: Refactored `src/execution/tools/webSearch.ts` and `websiteAudit.ts` to route outbound requests through the internal `safeFetchModule.safeFetch` function, which is cleanly spied on in tests.

## Detected Defect 2: Blind Redirects in Website Audit Tool
- **Description**: `websiteAudit.ts` previously used `nodeFetch(url, { redirect: 'follow' })`. If an external domain issued an HTTP 302 redirecting to `http://169.254.169.254/` or `http://127.0.0.1:3000/`, it would bypass initial URL validation.
- **Root Cause**: Redirect targets were not re-validated.
- **Resolution**: Routed `websiteAudit` through `safeFetch` which executes manual redirect inspection and re-runs `validateUrl` on each hop.

## Detected Defect 3: Residual Prompt Injection Text in Neutralization
- **Description**: Initial implementation replaced injection patterns with `[NEUTRALIZED_UNTRUSTED_INSTRUCTION: ${match}]`, leaving the adversarial instruction visible inside the replacement string.
- **Root Cause**: Pattern match retained in substitution.
- **Resolution**: Updated `sanitizeExternalText` to replace the instruction outright with `[NEUTRALIZED_UNTRUSTED_INSTRUCTION]`, completely eliminating malicious directives from downstream LLM context.
