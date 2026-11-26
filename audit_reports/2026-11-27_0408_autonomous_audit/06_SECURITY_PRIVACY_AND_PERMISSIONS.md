# 06. Security, Privacy & Permissions Audit

## 1. Authentication & Session Security
- **Founder PIN Verification:** `POST /api/auth/login` uses `bcrypt.compare` to perform constant-time comparison against `OWNER_PIN_HASH`, preventing timing attacks.
- **JWT Protection:** Signed with HS256 using `JWT_SECRET` (minimum 32 characters in production). Token expiry is enforced (`JWT_EXPIRY_SECONDS=86400`).
- **Protected Endpoints:** All business endpoints reject requests without a valid Bearer token (`HTTP 401 Unauthorized`).

---

## 2. Server-Side SSRF Protection (`src/security/ssrf.ts`)
The SSRF validation suite (`tests/security/ssrf.test.ts`, 26 tests) verifies that:
- Private IPv4 addresses (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) are blocked.
- Loopback addresses (`127.0.0.1`, `localhost`, `::1`) are blocked.
- Link-local addresses (`169.254.0.0/16`) and cloud metadata endpoints (`http://169.254.169.254/latest/meta-data`) are blocked.
- DNS resolution checks block hostnames resolving to private IPs (DNS rebinding defense).

---

## 3. Rate Limiting & Abuse Controls (`src/api/middleware/rateLimit.ts`)
- General API Limiter: 120 requests / minute.
- Auth Limiter: 5 login attempts / 15 minutes per IP.
- Upload Limiter: 10 document uploads / minute.
- Approval Limiter: 30 approvals / minute.

---

## 4. Production Secret Gates (`src/lib/config.ts`)
In production (`NODE_ENV=production`), `validateConfig` enforces strict fail-closed startup:
- Default development secrets (`DEFAULT_DEV_JWT_SECRET`, `DEFAULT_DEV_PIN_HASH`, `DEFAULT_DEV_MASTER_KEY`) are rejected.
- Placeholder Supabase URLs are rejected.
- Short or weak secrets throw `ConfigValidationError`, halting server boot.
