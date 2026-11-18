# SECURITY REVIEW: S08 — Body & Home (Mission 14)

## 1. Overview
The S08 (Body & Home) mission delivers the integrated THALOS product shell: the local runtime, adaptive PWA frontend, workspaces, settings, health telemetry, and recovery guidance. This review examines client-side credential protection, service worker security, cross-origin boundaries, and disaster recovery access controls.

---

## 2. Security Invariants Evaluated

### 2.1 Settings & Credential Masking (Zero Plaintext Exposure)
- **Invariant**: Credentials stored in the vault or settings must never be rendered in plaintext in the frontend or returned unmasked via API endpoints.
- **Verification**:
  - `GET /api/integrations` strictly filters secret values and returns `apiKeyMasked` showing only trailing characters with asterisks (e.g. `sk-****`).
  - Connection tests (`POST /api/integrations/:id/test`) execute server-side within the backend sandbox; the API key is decrypted in memory during the test and never returned in the response payload.

### 2.2 PWA Service Worker Scope & Content Security Policy
- **Invariant**: The service worker must not cache sensitive user tokens or leak API payloads into cross-origin storage.
- **Verification**:
  - `public/sw.js` restricts shell pre-caching strictly to public static assets (`index.html`, `manifest.json`, CDN fonts/icons).
  - API responses are routed via a network-first strategy and fall back to a safe generic offline JSON message on network disconnect without storing unauthorized cache records.
  - Helmet CSP directives restrict script and style sources to trusted origins with `'self'`.

### 2.3 Authentication Gate & Permission Enforcement
- **Invariant**: All operational workspace actions (viewing revenue, reviewing approvals, executing prompts, creating leads) require valid founder PIN clearance.
- **Verification**:
  - Protected API routes enforce `requireAuth` with JWT verification.
  - When a 401/403 status occurs, the UI triggers `handlePermissionDenied()`, immediately revokes the client token, and displays the PIN entry challenge.

### 2.4 Disaster Recovery & Runbook Integrity
- **Invariant**: System recovery guidance must provide actionable founder runbooks without exposing live encryption keys or infrastructure root passwords.
- **Verification**:
  - `GET /api/system/recovery` and `GET /api/system/backup` provide architectural and procedural steps (Supabase PITR, worker restart, credential rotation procedures) while keeping database credentials strictly in server-side vault storage.
