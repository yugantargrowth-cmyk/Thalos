# 11. Manual Test Plan for Human Operator

## Scenario 1: Founder Login & PIN Vaulting
1. Open browser to `http://localhost:3000`.
2. Observe topbar displays **Locked** status button.
3. Click **Unlock** or try triggering an action to open the PIN Modal.
4. Enter PIN `1234` (or configured owner PIN).
5. Verify topbar changes to **Unlocked (Founder)** and JWT token is vaulted in `localStorage.getItem('thalos_auth_token')`.

---

## Scenario 2: Companion Chat & Clarification Guard
1. In the Companion chat widget, type: `"Draft an invoice"`.
2. **Expected Response:** THALOS identifies missing parameters and asks:
   > *"Could you specify the client name and the invoice amount so I can draft this accurately?"*
3. Reply: `"Client is Acme Corp for ₹50,000 for monthly SEO"`.
4. **Expected Result:** Tool loop executes `build_invoice`, halts at approval gate, and informs founder that the invoice has been queued for approval.

---

## Scenario 3: Approval Queue Review & Execution
1. Navigate to **My Day → Approvals**.
2. Locate the pending invoice for Acme Corp.
3. Click **Approve** (or **Reject** with reason).
4. Verify status updates immediately to `approved` (or `rejected`) with atomic review timestamp.

---

## Scenario 4: Document Ingestion & RAG Search
1. Navigate to **Knowledge & Research**.
2. Drag and drop a PDF or TXT business document into the upload dropzone.
3. Verify upload completes with `status: pending` (queued for background processing).
4. Attempt uploading the identical file again.
5. Verify toast shows: `"Duplicate file — identical content already indexed"`.
6. Search for a phrase from the document in the search bar and verify retrieved chunks include citation and score.
