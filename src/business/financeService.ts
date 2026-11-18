/**
 * Finance Domain Service
 * ─────────────────────────────────────────────────────────────
 * Centralizes decimal-safe financial calculations, invoice lifecycle
 * state machines, duplicate payment guards, and proposal generation (L12-AC-04, L12-AC-05).
 */

import { getSupabase } from '../lib/supabase.js';
import { audit } from '../lib/audit.js';
import type {
  InvoiceEntity,
  InvoiceStatus,
  PaymentEntity,
  ProposalEntity,
  LineItem,
} from './entities.js';

export interface LineItemInput {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface CreateProposalInput {
  client_name: string;
  client_email?: string | null;
  client_id?: string | null;
  lead_id?: string | null;
  line_items: LineItemInput[];
  tax_percent?: number;
  tax_rate_id?: string | null;
  custom_scope?: string | null;
  valid_until?: string | null;
  notes?: string | null;
}

export interface CreateInvoiceInput {
  client_name: string;
  client_email?: string | null;
  client_id?: string | null;
  proposal_id?: string | null;
  line_items: LineItemInput[];
  tax_percent?: number;
  tax_rate_id?: string | null;
  due_date: string;
  notes?: string | null;
}

export interface RecordPaymentInput {
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method?: 'bank_transfer' | 'upi' | 'cash' | 'cheque' | 'online' | 'other';
  reference?: string | null;
  notes?: string | null;
  evidence_type?: string;
  evidence_ref?: string | null;
}

/**
 * Decimal-safe rounding to exactly 2 decimal places (in paise/cents)
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Decimal-safe line item and subtotal calculation (L12-AC-04)
 */
export function computeFinancialTotals(lineItems: LineItemInput[], taxPercent: number) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error('line_items must be a non-empty array of {description, quantity, unit_price}');
  }
  if (taxPercent < 0 || taxPercent > 100) {
    throw new Error('tax_percent must be 0–100');
  }

  const items: LineItem[] = lineItems.map((item, idx) => {
    if (!item.description || typeof item.quantity !== 'number' || typeof item.unit_price !== 'number') {
      throw new Error(`line_items[${idx}] must have description (string), quantity (number), unit_price (number)`);
    }
    if (item.quantity <= 0) {
      throw new Error(`line_items[${idx}]: quantity must be > 0`);
    }
    if (item.unit_price < 0) {
      throw new Error(`line_items[${idx}]: unit_price must be >= 0`);
    }

    const subtotal = round2(item.quantity * item.unit_price);
    return {
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: round2(item.unit_price),
      subtotal,
    };
  });

  const subtotal = round2(items.reduce((sum, item) => sum + item.subtotal, 0));
  const taxAmount = round2((subtotal * taxPercent) / 100);
  const total = round2(subtotal + taxAmount);

  // Invariant verification check matching DB constraint
  if (Math.abs(total - (subtotal + taxAmount)) >= 0.02) {
    throw new Error(`Financial invariant violation: total (${total}) does not match subtotal + tax (${subtotal + taxAmount})`);
  }

  return { items, subtotal, taxAmount, total };
}

// ── State Transition Rules (L12-AC-05) ────────────────────────
export const VALID_INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['approved', 'sent', 'cancelled', 'void'],
  approved: ['sent', 'cancelled', 'void'],
  sent: ['partially_paid', 'paid', 'overdue', 'cancelled', 'void'],
  partially_paid: ['paid', 'overdue', 'void'],
  overdue: ['partially_paid', 'paid', 'void'],
  paid: ['void'], // Paid invoice cannot be edited; can only be voided with audit
  cancelled: [],  // Terminal state
  void: [],       // Terminal state
};

export class FinanceService {
  /** Create a formal business proposal */
  async createProposal(input: CreateProposalInput, actor = 'founder'): Promise<ProposalEntity> {
    if (!input.client_name || !input.client_name.trim()) {
      throw new Error('client_name is required');
    }

    const taxPercent = input.tax_percent ?? 18;
    const { items, subtotal, taxAmount, total } = computeFinancialTotals(input.line_items, taxPercent);

    const supabase = getSupabase();
    const { data: proposal, error } = await supabase
      .from('proposals')
      .insert({
        client_name: input.client_name.trim(),
        client_email: input.client_email?.trim() ?? null,
        client_id: input.client_id ?? null,
        lead_id: input.lead_id ?? null,
        line_items: items,
        custom_scope: input.custom_scope ?? null,
        subtotal,
        tax_rate_id: input.tax_rate_id ?? null,
        tax_percent: taxPercent,
        tax_amount: taxAmount,
        total,
        valid_until: input.valid_until ?? null,
        status: 'draft',
        notes: input.notes ?? null,
      })
      .select('*')
      .single();

    if (error || !proposal) {
      throw new Error(`build_proposal DB insert failed: ${error?.message || 'unknown error'}`);
    }

    await audit({
      event_type: 'proposal.created',
      entity_type: 'proposal',
      entity_id: proposal.id,
      actor,
      description: `Proposal created for ${proposal.client_name} — ₹${total.toLocaleString('en-IN')}`,
      metadata: { total, tax_percent: taxPercent },
    });

    return proposal as ProposalEntity;
  }

  /** Create an invoice with sequential invoice numbering and decimal-safe totals */
  async createInvoice(input: CreateInvoiceInput, actor = 'founder'): Promise<InvoiceEntity> {
    if (!input.client_name || !input.client_name.trim()) {
      throw new Error('client_name is required');
    }
    if (!input.due_date || !input.due_date.trim()) {
      throw new Error('due_date is required');
    }

    const taxPercent = input.tax_percent ?? 18;
    const { items, subtotal, taxAmount, total } = computeFinancialTotals(input.line_items, taxPercent);

    const supabase = getSupabase();

    // Get sequential invoice number or fallback
    let invoiceNumber: string;
    try {
      const { data: numResult } = await supabase.rpc('next_invoice_number');
      invoiceNumber = (numResult as string) || `YG-${new Date().getFullYear()}-001`;
    } catch {
      invoiceNumber = `YG-${new Date().getFullYear()}-001`;
    }

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        client_name: input.client_name.trim(),
        client_email: input.client_email?.trim() ?? null,
        client_id: input.client_id ?? null,
        proposal_id: input.proposal_id ?? null,
        line_items: items,
        subtotal,
        tax_rate_id: input.tax_rate_id ?? null,
        tax_percent: taxPercent,
        tax_amount: taxAmount,
        total,
        balance_due: total,
        due_date: input.due_date,
        status: 'draft',
        notes: input.notes ?? null,
      })
      .select('*')
      .single();

    if (error || !invoice) {
      throw new Error(`build_invoice DB insert failed: ${error?.message || 'unknown error'}`);
    }

    await audit({
      event_type: 'invoice.created',
      entity_type: 'invoice',
      entity_id: invoice.id,
      actor,
      description: `Invoice ${invoiceNumber} created for ${invoice.client_name} — ₹${total.toLocaleString('en-IN')}`,
      metadata: { invoice_number: invoiceNumber, total, subtotal, tax_amount: taxAmount },
    });

    return invoice as InvoiceEntity;
  }

  /** Transition invoice lifecycle status verifying state machine rules (L12-AC-05) */
  async updateInvoiceStatus(
    invoiceId: string,
    newStatus: InvoiceStatus,
    actor = 'founder'
  ): Promise<InvoiceEntity> {
    const supabase = getSupabase();
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

    const currentStatus = invoice.status as InvoiceStatus;
    const allowed = VALID_INVOICE_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid invoice state transition from '${currentStatus}' to '${newStatus}'`);
    }

    const { data: updated, error } = await supabase
      .from('invoices')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)
      .select('*')
      .single();

    if (error || !updated) {
      throw new Error(`Failed to update invoice status: ${error?.message}`);
    }

    await audit({
      event_type: 'invoice.status_changed',
      entity_type: 'invoice',
      entity_id: invoiceId,
      actor,
      description: `Invoice ${invoice.invoice_number} transitioned from ${currentStatus} to ${newStatus}`,
      metadata: { previous: currentStatus, new: newStatus },
    });

    return updated as InvoiceEntity;
  }

  /**
   * Record payment against an invoice with validation and duplicate prevention (L12-AC-05).
   */
  async recordPayment(input: RecordPaymentInput, actor = 'founder'): Promise<PaymentEntity> {
    const paymentAmount = round2(input.amount);

    if (paymentAmount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const supabase = getSupabase();
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', input.invoice_id)
      .single();

    if (!invoice) throw new Error(`Invoice not found: ${input.invoice_id}`);

    // Check invoice status
    if (invoice.status === 'void' || invoice.status === 'cancelled') {
      throw new Error(`Cannot record payment on a ${invoice.status} invoice`);
    }

    if (invoice.status === 'paid' || invoice.balance_due <= 0) {
      throw new Error(`Invoice ${invoice.invoice_number} is already fully paid`);
    }

    if (paymentAmount > round2(invoice.balance_due)) {
      throw new Error(
        `Payment amount (₹${paymentAmount}) exceeds invoice balance due (₹${invoice.balance_due})`
      );
    }

    // Check duplicate payment reference if reference is provided
    if (input.reference && input.reference.trim()) {
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id, reference')
        .eq('invoice_id', input.invoice_id)
        .eq('reference', input.reference.trim())
        .maybeSingle();

      if (existingPayment) {
        throw new Error(
          `Payment with reference '${input.reference.trim()}' has already been recorded for this invoice`
        );
      }
    }

    // Insert immutable payment record
    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        invoice_id: input.invoice_id,
        amount: paymentAmount,
        payment_date: input.payment_date,
        payment_method: input.payment_method ?? 'bank_transfer',
        reference: input.reference?.trim() ?? null,
        notes: input.notes?.trim() ?? null,
        recorded_by: actor,
        evidence_type: input.evidence_type ?? 'manual_entry',
        evidence_ref: input.evidence_ref ?? null,
      })
      .select('*')
      .single();

    if (error || !payment) {
      throw new Error(`Failed to record payment: ${error?.message}`);
    }

    // Update invoice balance and status
    const newBalance = round2(invoice.balance_due - paymentAmount);
    const newStatus: InvoiceStatus = newBalance <= 0 ? 'paid' : 'partially_paid';

    await supabase
      .from('invoices')
      .update({
        balance_due: newBalance,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.invoice_id);

    await audit({
      event_type: 'payment.recorded',
      entity_type: 'invoice',
      entity_id: input.invoice_id,
      actor,
      description: `Payment of ₹${paymentAmount.toLocaleString('en-IN')} recorded for invoice ${invoice.invoice_number}`,
      metadata: {
        payment_id: payment.id,
        amount: paymentAmount,
        reference: input.reference,
        new_balance: newBalance,
        status: newStatus,
      },
    });

    return payment as PaymentEntity;
  }

  /**
   * Generate proposal PDF document from validated business data and persist with versioning (S05-AC-06).
   */
  async generateProposalDocument(
    proposalId: string,
    version = 1,
    actor = 'system'
  ): Promise<{ document_id: string; proposal: ProposalEntity; buffer: Buffer; checksum: string }> {
    if (!proposalId) throw new Error('proposalId is required');

    const supabase = getSupabase();
    const { data: proposal, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (error || !proposal) throw new Error(`Proposal not found: ${proposalId}`);

    const { buildProposalPDF } = await import('./proposals/pdfBuilder.js');
    const buffer = await buildProposalPDF(proposal);
    const crypto = await import('crypto');
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    // Persist as a versioned document record
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .insert({
        title: `Proposal - ${proposal.client_name} (v${version})`,
        original_filename: `proposal_${proposalId.slice(0, 8)}_v${version}.pdf`,
        file_format: 'pdf',
        mime_type: 'application/pdf',
        file_size_bytes: buffer.length,
        checksum_sha256: checksum,
        version,
        status: 'indexed',
        category: 'proposal',
        has_extractable_text: true,
        tags: ['proposal', `proposal_id:${proposalId}`],
        uploaded_by: actor,
      })
      .select('*')
      .single();

    if (docErr || !doc) throw new Error(`Failed to store proposal document: ${docErr?.message}`);

    await audit({
      event_type: 'proposal.document_generated',
      entity_type: 'proposal',
      entity_id: proposalId,
      actor,
      description: `Generated proposal document v${version} for ${proposal.client_name}`,
      metadata: { document_id: doc.id, version, checksum },
    });

    return {
      document_id: doc.id,
      proposal: proposal as ProposalEntity,
      buffer,
      checksum,
    };
  }
}

export const financeService = new FinanceService();
