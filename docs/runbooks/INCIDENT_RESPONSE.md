# Runbook: Incident Response & Triage

## Severity Classification
- **P1 (Critical):** API or Worker down, credential compromise suspected, database unavailable, data corruption.
- **P2 (High):** Background jobs stalled, integration provider failing repeatedly, approval state deadlock.
- **P3 (Medium):** Non-blocking tool failure, single route latency spike, degraded search results.
- **P4 (Low):** UI glitch, minor log warning, non-critical documentation issue.

## 1. Triage Workflow
1. **Verify Health Endpoints:**
   - API liveness: `curl -i http://localhost:3000/health`
   - API readiness: `curl -i http://localhost:3000/health/ready`
   - Worker liveness: `curl -i http://localhost:3001/health`
   - Worker readiness: `curl -i http://localhost:3001/health/ready`

2. **Inspect Structured Logs:**
   - Check error logs for `correlationId` associated with user error reports.
   - Trace failing request using `x-correlation-id`.

3. **Check Job Queue Health:**
   - Query stuck or stalled jobs:
     ```sql
     SELECT id, job_type, status, attempt, error, lease_expires_at, updated_at
     FROM jobs
     WHERE status IN ('running', 'failed', 'dead_letter')
     ORDER BY updated_at DESC LIMIT 20;
     ```

## 2. Recovery Actions
### Restart API Gracefully:
```bash
# Graceful stop triggered on SIGTERM/SIGINT
kill -SIGTERM <api_pid>
npm start
```

### Restart Background Worker:
```bash
kill -SIGTERM <worker_pid>
npm run start:worker
```

### Suspected Credential Compromise:
1. Revoke provider API keys in provider consoles (Groq, Resend, Supabase).
2. Issue updated keys in THALOS Settings / Integrations API.
3. If `CREDENTIAL_MASTER_KEY` was exposed, re-encrypt all credentials in `integrations` with a new key and update the environment variable.
