/**
 * Finance Tool Handlers
 * ─────────────────────────────────────────────────────────────
 * build_proposal, build_invoice
 *
 * These tools CREATE records in the DB and generate PDF bytes.
 * They require approval before any external distribution.
 * Server-side total computation only — never trusts client-supplied totals.
 * Delegates domain operations directly to financeService (L12-AC-07).
 *
 * DISCLAIMER: Tax calculations are for internal reference only.
 * Always verify with a qualified CA for GST compliance.
 */

import { buildProposalPDF, buildInvoicePDF } from '../../business/proposals/pdfBuilder.js';
import { financeService } from '../../business/financeService.js';
import type { LineItemInput } from '../../business/financeService.js';

export async function executeBuildProposal(inputs: Record<string, unknown>): Promise<{ output: unknown; evidence: string }> {
  const client_name = inputs.client_name as string;
  const line_items = inputs.line_items as LineItemInput[];
  const tax_percent = inputs.tax_percent as number | undefined;

  const proposal = await financeService.createProposal({
    client_name,
    client_email: (inputs.client_email as string | undefined) ?? null,
    client_id: (inputs.client_id as string | undefined) ?? null,
    lead_id: (inputs.lead_id as string | undefined) ?? null,
    line_items,
    tax_percent,
    custom_scope: (inputs.custom_scope as string | undefined) ?? null,
    valid_until: (inputs.valid_until as string | undefined) ?? null,
    notes: (inputs.notes as string | undefined) ?? null,
  });

  const pdfBuffer = await buildProposalPDF({ ...proposal });
  const pdfBase64 = pdfBuffer.toString('base64');

  return {
    output: {
      proposal_id: proposal.id,
      client_name: proposal.client_name,
      subtotal: proposal.subtotal,
      tax_percent: proposal.tax_percent,
      tax_amount: proposal.tax_amount,
      total: proposal.total,
      status: 'draft',
      pdf_base64: pdfBase64,
      note: 'DRAFT — requires approval before sending to client.',
    },
    evidence: `Proposal ${proposal.id} created for ${proposal.client_name}, total ₹${proposal.total} (incl. ${proposal.tax_percent}% GST) at ${new Date().toISOString()}. PDF generated.`,
  };
}

export async function executeBuildInvoice(inputs: Record<string, unknown>): Promise<{ output: unknown; evidence: string }> {
  const client_name = inputs.client_name as string;
  const due_date = inputs.due_date as string;
  const line_items = inputs.line_items as LineItemInput[];
  const tax_percent = inputs.tax_percent as number | undefined;

  const invoice = await financeService.createInvoice({
    client_name,
    client_email: (inputs.client_email as string | undefined) ?? null,
    client_id: (inputs.client_id as string | undefined) ?? null,
    proposal_id: (inputs.proposal_id as string | undefined) ?? null,
    line_items,
    tax_percent,
    due_date,
    notes: (inputs.notes as string | undefined) ?? null,
  });

  const pdfBuffer = await buildInvoicePDF({ ...invoice });
  const pdfBase64 = pdfBuffer.toString('base64');

  return {
    output: {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      client_name: invoice.client_name,
      subtotal: invoice.subtotal,
      tax_percent: invoice.tax_percent,
      tax_amount: invoice.tax_amount,
      total: invoice.total,
      balance_due: invoice.balance_due,
      due_date: invoice.due_date,
      status: 'draft',
      pdf_base64: pdfBase64,
      note: 'DRAFT — requires approval before sending. DISCLAIMER: Tax is estimated; verify with CA.',
    },
    evidence: `Invoice ${invoice.invoice_number} (${invoice.id}) created for ${invoice.client_name}, ₹${invoice.total} due ${invoice.due_date} at ${new Date().toISOString()}. PDF generated.`,
  };
}
