# 09. Findings & Prioritized Roadmap

## 1. Audit Findings Inventory

| Finding ID | Title | Severity | Confidence | Status | Category |
|------------|-------|----------|------------|--------|----------|
| **F-01** | Upstream Next.js 16.4.3 security advisory notice during build | P3 (Low) | High | Warning | Dependency |
| **F-02** | n8n adapter currently declared as disabled stub | P3 (Low) | High | Mock / By Design | Integrations |
| **F-03** | Physical audio input/output requires browser hardware | P3 (Low) | High | Blocked (Hardware) | UX / Voice |
| **F-04** | Feature branch `feature/five-mission-completion` unpushed | P2 (Medium)| High | Local State | Version Control |

---

## 2. Remediation Analysis

### Finding F-01: Upstream Next.js Advisory
- **Root Cause:** Next.js version 16.4.3 triggers a built-in npm advisory nudge.
- **Impact:** Non-blocking; build succeeds on retry and static HTML files are generated correctly.
- **Recommended Fix:** Run `next upgrade` in `frontend/` to upgrade to Next.js 16.4.4+.

### Finding F-04: Unpushed Working Branch
- **Root Cause:** In accordance with safety rules, Antigravity CLI does not push to remote repositories without explicit user instruction.
- **Impact:** Code changes, tests, and evidence packs are safe locally on `feature/five-mission-completion` but not yet on GitHub.
- **Recommended Fix:** Run `git push origin feature/five-mission-completion` when authorized.

---

## 3. Prioritized Engineering Roadmap

```
+-------------------------------------------------------------------------------+
|                        THALOS ROADMAP: NEXT PHASES                            |
+--------------------------+--------------------------+-------------------------+
| Phase 1: Deploy & Push   | Phase 2: Production Init | Phase 3: Live Channels  |
| - Push feature branch    | - Apply SQL migrations   | - WhatsApp Cloud API    |
| - Open GitHub PR         | - Configure Groq/Gemini  | - Resend / SES Email    |
| - Upgrade Next.js minor  | - Start PM2 supervisor   | - Live client pilot     |
+--------------------------+--------------------------+-------------------------+
```
