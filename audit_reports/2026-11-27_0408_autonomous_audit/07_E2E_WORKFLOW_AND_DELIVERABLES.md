# 07. End-to-End Workflow & Deliverables Audit

## 1. Full Business Lifecycle Trace

```mermaid
sequenceDiagram
  autonumber
  actor F as Founder (Shlok)
  participant UI as Dashboard PWA
  participant API as Express API (:3000)
  participant O as Orchestrator
  participant S as Scout/Hunter/Closer
  participant Q as Approval Queue
  participant DB as Supabase DB

  F->>UI: Prompt: "Research prospects in Ahmedabad"
  UI->>API: POST /api/intelligence/chat (Bearer Token)
  API->>O: thalosOrchestrate
  O->>S: Delegate to Scout (web_search)
  S-->>O: 3 Qualified Prospects Found
  O-->>API: Synthesized Response + Done Status
  API-->>UI: Renders response + Action: completed
  
  F->>UI: Prompt: "Draft email to Apex Logistics"
  UI->>API: POST /api/intelligence/chat
  O->>S: Delegate to Hunter (draft_email)
  S->>Q: Queued in approval_queue (requires_approval)
  Q-->>O: approval_id: appr-apex-01
  O-->>UI: Response: "Queued for your approval" (Status: pending_approval)
  
  F->>UI: Navigates to Approvals Workspace -> Clicks "Approve"
  UI->>API: POST /api/approvals/appr-apex-01/approve
  API->>DB: Updates status to approved
  API->>S: Executes send_email
  API-->>UI: Status: completed
```

---

## 2. File Generation Deliverables
- **PDF Generation:** Implemented via PDFKit:
  - Proposals: `src/business/proposalPdf.ts` (`buildProposalPDF`) generates downloadable PDF with Yugantar branding, scope, line items, and terms.
  - Invoices: `src/business/invoicePdf.ts` (`buildInvoicePDF`) generates formatted tax invoices with GST calculations and bank payment details.
- **CSV Data Export:** Implemented in `src/execution/tools/reportingTools.ts` (`export_business_data`) supporting CSV export of leads and client pipelines.
- **Verification Result:** PDF generation verified in `tests/unit/businessOrgans.test.ts` (S05-AC-06).
