# DEFECT REGISTER: S08 — Body & Home (Mission 14)

| Defect ID | Severity | Description | Resolution / Status |
|---|---|---|---|
| **DEF-S08-01** | Medium | Missing PWA web app manifest (`manifest.json`) and service worker (`sw.js`) preventing PWA installation and offline caching. | **Resolved**: Created `public/manifest.json` with maskable icons and standalone mode; created `public/sw.js` with shell pre-caching and API offline fallback. |
| **DEF-S08-02** | Medium | Dashboard metrics and kanban board in `public/index.html` were statically rendered without live backend API wire-up. | **Resolved**: Implemented live data loaders calling `/api/leads/report`, `/api/finance/summary`, `/api/clients`, and `/api/system/agents`. |
| **DEF-S08-03** | Low | Missing endpoints for founder visibility into backup status, disaster recovery runbooks, and structured system logs. | **Resolved**: Added `/api/system/logs`, `/api/system/backup`, and `/api/system/recovery` endpoints to `src/api/routes/system.ts`. |
| **DEF-S08-04** | Low | Pipeline report had no dedicated endpoint in `src/api/routes/leads.ts`. | **Resolved**: Added `GET /api/leads/report` hooked into `reportingService.getPipelineReport()`. |
