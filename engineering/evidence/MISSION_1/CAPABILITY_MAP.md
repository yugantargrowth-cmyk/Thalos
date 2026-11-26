# Mission 1 Capability & Route Traceability Map

| UI location | user action | current handler | API/service called | data source | auth/permission | status | gap |
|---|---|---|---|---|---|---|---|
| TopBar / BrandMark | View branding & system state | React render | `/health/ready` | API & in-memory | Public | PASS | Replaced mock date with live IST date & status |
| TopBar / Auth Lock | Enter Founder PIN / Unlock | `setPinModalOpen(true)` | `POST /api/auth/login` | Vault / bcrypt | Founder Only (PIN) | PASS | Added dynamic PIN dialog with `localStorage` token retention |
| TopBar / Mode Toggle | Switch between Clean & Demo | `dispatch({ type })` | Client state | `localStorage` / Demo fixtures | Public | PASS | Sourced state with clear badge indicator |
| TopBar / Global Search | Search records & environments | `onKeyDown` | Route navigation | Workspaces enum | Authenticated | PASS | Resolves to valid routes with keyboard shortcuts (ESC, Enter) |
| TopBar / Notification Bell| View unread count | `onClick` | Local counts | React state | Authenticated | PASS | Sourced from leads & approval queue |
| TopBar / PWA Install | Install PWA | `beforeinstallprompt` | Browser native PWA | Service Worker / manifest | Public | PASS | Standard PWA runtime event wired |
| TopBar / Profile Avatar | Navigate to settings | `navigate()` | Route navigation | Workspaces enum | Authenticated | PASS | Directly opens Execution & Settings -> Integrations |
| Radial Navigation | Switch environment | `onSelect` | `navigate(env)` | Workspaces enum | Authenticated | PASS | Full 6 environments navigable |
| Mobile Command Bar | Select workspace | `onNavigate` | Route navigation | Workspaces enum | Authenticated | PASS | Modal picker for landscape & mobile breakpoints |
| My Day -> Overview | View 4 summary queues | React render | `GET /api/leads`, `GET /api/approvals`, `GET /api/finance/invoices` | Express API / DB | Authenticated | PASS | Sourced from backend with sample fallback label |
| My Day -> Approvals | Review & Approve/Reject action | `handleApproval()` | `POST /api/approvals/:id/approve`, `POST /api/approvals/:id/reject` | Supabase `approval_queue` | Founder Only (Atomic) | PASS | Now directly executes server-side single-use approval |
| Revenue -> Lead CRM | Filter, view & search leads | React state | `GET /api/leads` | Supabase `leads` | Authenticated | PASS | Live sync with `/api/leads` |
| Revenue -> Lead Discovery | Import leads via CSV | `onImportLeads` | `POST /api/leads` | CSV Parser / CRM service | Authenticated | PASS | Triaged and persisted to backend |
| Revenue -> Lead Details | Update stage, score, tier | `onUpdateLead` | `PATCH /api/leads/:id` | Supabase `leads` | Authenticated | PASS | Updates persisted to canonical API |
| Revenue -> Proposals & Invoices | View/create invoice, verify UTR | `onUpdateInvoice` | `POST /api/finance/invoices`, `POST /api/finance/invoices/:id/verify-utr` | Supabase `invoices` | Authenticated | PASS | Indian NPCI UPI validation + UTR verification |
| Digital World -> Clients | View & manage client roster | React render | `GET /api/clients`, `POST /api/clients` | Supabase `clients` | Authenticated | PASS | Synchronized with CRM service |
| Digital World -> Tasks | Update task status | `onTask` | State reducer | React state / projects | Authenticated | PASS | Handled with bounded task state machine |
| AI Team -> Specialist Roster | Inspect 9 agents | `onSelect` | `GET /api/system/agents` | Supabase `agents` | Authenticated | PASS | Preserves 9 canonical agents and roles |
| AI Team -> Models Catalogue | Inspect active models | React render | `GET /api/integrations/models` | Server config | Authenticated | PASS | Displays model routing and primary providers |
| AI Team -> Tool Permissions | Inspect tool execution scopes | React render | `GET /api/system/tools` | Supabase `tools` | Authenticated | PASS | Live tools rendered with approval policy badges |
| Knowledge -> Search | Hybrid semantic & keyword RAG | `handleSearch` | `POST /api/knowledge/search` | pgvector + Full-text | Authenticated | PASS | Added live hybrid search UI |
| Knowledge -> Upload | Upload document for ingestion | `handleUpload` | `POST /api/knowledge/documents` | Ingestion Queue / Worker | Authenticated | PASS | Added multi-format upload form (PDF, TXT, MD, CSV) |
| Execution & Settings -> Ops | Worker & Queue Telemetry | `loadQueue` | `GET /api/system/queue` | Worker queue | Authenticated | PASS | Live telemetry (queued, running, dead_letter, completed) |
| Execution & Settings -> Ops | Retry Dead Letter Jobs | `handleRetryDeadLetter`| `POST /api/system/queue/retry-dead-letter` | Worker queue / DB | Authenticated | PASS | Replays failed worker jobs |
| Execution & Settings -> Integ| Save API Keys | `saveBackendSettings` | `POST /api/integrations/settings` | AES-256 Vault | Founder Only | PASS | Encrypted storage without exposing plaintext |
| Execution & Settings -> Integ| Test provider connection | `testConnection` | `POST /api/integrations/:provider/test` | Integration adapters | Founder Only | PASS | Real connection tester with latency metrics |
| Execution & Settings -> Health| System telemetry | `checkHealth` | `GET /health/ready`, `GET /api/system/health` | Multi-tier health | Public/Auth | PASS | Live DB, Vault, and Worker health check |
| Companion Drawer | Chat with THALOS Orchestrator | `sendQuery` | `POST /api/intelligence/chat` | Express Orchestrator | Authenticated | PASS | Eliminated Next shadow route; uses authenticated Express API |
