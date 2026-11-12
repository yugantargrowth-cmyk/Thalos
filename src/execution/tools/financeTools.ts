/**
 * Finance Tool Handlers
 * ─────────────────────────────────────────────────────────────
 * build_proposal, build_invoice
 *
 * These tools CREATE records in the DB and generate PDF bytes.
 * They require approval before any external distribution.
 * Server-side total computation only — never trusts client-supplied totals.
 *
 * DISCLAIMER: Tax calculations are for internal reference only.
 * Always verify with a qualified CA for GST compliance.
 */

import { getSupabase } from '../../lib/supabase.js';
import { audit } from '../../lib/audit.js';
import { buildProposalPDF, buildInvoicePDF } from '../../business/proposals/pdfBuilder.js';

type LineItemInput = {
  description: string;
  quantity: number;
  unit_price: number;
};

function computeTotals(lineItems: LineItemInput[], taxPercent: number) {
  const items = lineItems.map(item => ({
    ...item,
    subtotal: parseFloat((item.quantity * item.unit_price).toFixed(2)),
  }));
  const subtotal = parseFloat(items.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
  const taxAmount = parseFloat((subtotal * taxPercent / 100).toFixed(2));
  const total = parseFloat((subtotal + taxAmount).toFixed(2));
  return { items, subtotal, taxAmount, total };
}

function requireLineItems(inputs: Record<string, unknown>): LineItemInput[] {
  const raw = inputs.line_items;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('line_items must be a non-empty array of {description, quantity, unit_price}');
  }
  return raw.map((item, i) => {
    if (!item.description || typeof item.quantity !== 'number' || typeof item.unit_price !== 'number') {
      throw new Error(`line_items[${i}] must have description (string), quantity (number), unit_price (number)`);
    }
    if (item.quantity <= 0 || item.unit_price < 0) {
      throw new Error(`line_items[${i}]: quantity must be > 0 and unit_price must be >= 0`);
    }
    return { description: item.description, quantity: item.quantity, unit_price: item.unit_price };
  });
}

// ── build_proposal ────────────────────────────────────────────

export async function executeBuildProposal(inputs: Record<string, unknown>): Promise<{ output: unknown; evidence: string }> {
  const client_name = inputs.client_name as string;
  if (!client_name?.trim()) throw new Error('client_name is required');

  const lineItems = requireLineItems(inputs);
  const taxPercent = (inputs.tax_percent as number | undefined) ?? 18;
  if (taxPercent < 0 || taxPercent > 100) throw new Error('tax_percent must be 0–100');

  const { items, subtotal, taxAmount, total } = computeTotals(lineItems, taxPercent);

  const record = {
    client_id: (inputs.client_id as string | undefined) ?? null,
    lead_id: (inputs.lead_id as string | undefined) ?? null,
    client_name,
    client_email: (inputs.client_email as string | undefined) ?? null,
    line_items: items,
    custom_scope: (inputs.custom_scope as string | undefined) ?? null,
    subtotal,
    tax_percent: taxPercent,
    tax_amount: taxAmount,
    total,
    valid_until: (inputs.valid_until as string | undefined) ?? null,
    status: 'draft',
    notes: (inputs.notes as string | undefined) ?? null,
  };

  const supabase = getSupabase();
  const { data, error } = await supabase.from('proposals').insert(record).select().single();
  if (error) throw new Error(`build_proposal DB insert failed: ${error.message}`);

  // Build PDF bytes
  const pdfBuffer = await buildProposalPDF({ ...data });
  const pdfBase64 = pdfBuffer.toString('base64');

  await audit({
    event_type: 'tool.build_proposal',
    entity_type: 'proposal',
    entity_id: data.id,
    description: `Proposal created for ${client_name}: ₹${total.toLocaleString('en-IN')}`,
    metadata: { total, tax_percent: taxPercent },
  });

  return {
    output: {
      proposal_id: data.id,
      client_name,
      subtotal,
      tax_percent: taxPercent,
      tax_amount: taxAmount,
      total,
      status: 'draft',
      pdf_base64: pdfBase64,
      note: 'DRAFT — requires approval before sending to client.',
    },
    evidence: `Proposal ${data.id} created for ${client_name}, total ₹${total} (incl. ${taxPercent}% GST) at ${new Date().toISOString()}. PDF generated.`,
  };
}

// ── build_invoice ─────────────────────────────────────────────

export async function executeBuildInvoice(inputs: Record<string, unknown>): Promise<{ output: unknown; evidence: string }> {
  const client_name = inputs.client_name as string;
  const due_date = inputs.due_date as string;
  if (!client_name?.trim()) throw new Error('client_name is required');
  if (!due_date?.trim()) throw new Error('due_date is required');

  const lineItems = requireLineItems(inputs);
  const taxPercent = (inputs.tax_percent as number | undefined) ?? 18;
  if (taxPercent < 0 || taxPercent > 100) throw new Error('tax_percent must be 0–100');

  const { items, subtotal, taxAmount, total } = computeTotals(lineItems, taxPercent);

  const supabase = getSupabase();

  // Get next invoice number from DB function
  const { data: numData } = await supabase.rpc('next_invoice_number');
  const invoiceNumber = (numData as string | null) ?? `YG-${new Date().getFullYear()}-001`;

  const record = {
    invoice_number: invoiceNumber,
    client_id: (inputs.client_id as string | undefined) ?? null,
    proposal_id: (inputs.proposal_id as string | undefined) ?? null,
    client_name,
    client_email: (inputs.client_email as string | undefined) ?? null,
    line_items: items,
    subtotal,
    tax_percent: taxPercent,
    tax_amount: taxAmount,
    total,
    balance_due: total,
    due_date,
    status: 'draft',
    notes: (inputs.notes as string | undefined) ?? null,
  };

  const { data, error } = await supabase.from('invoices').insert(record).select().single();
  if (error) throw new Error(`build_invoice DB insert failed: ${error.message}`);

  const pdfBuffer = await buildInvoicePDF({ ...data });
  const pdfBase64 = pdfBuffer.toString('base64');

  await audit({
    event_type: 'tool.build_invoice',
    entity_type: 'invoice',
    entity_id: data.id,
    description: `Invoice ${invoiceNumber} created for ${client_name}: ₹${total}`,
    metadata: { total, invoice_number: invoiceNumber },
  });

  return {
    output: {
      invoice_id: data.id,
      invoice_number: invoiceNumber,
      client_name,
      subtotal,
      tax_percent: taxPercent,
      tax_amount: taxAmount,
      total,
      balance_due: total,
      due_date,
      status: 'draft',
      pdf_base64: pdfBase64,
      note: 'DRAFT — requires approval before sending. DISCLAIMER: Tax is estimated; verify with CA.',
    },
    evidence: `Invoice ${invoiceNumber} (${data.id}) created for ${client_name}, ₹${total} due ${due_date} at ${new Date().toISOString()}. PDF generated.`,
  };
}
