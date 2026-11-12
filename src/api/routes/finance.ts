import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { getSupabase } from '../../lib/supabase.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../middleware/errorHandler.js';
import { buildProposalPDF, buildInvoicePDF } from '../../business/proposals/pdfBuilder.js';

const router = Router();

// ── Proposals ─────────────────────────────────────────────────
router.get('/proposals', async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error, count } = await supabase
    .from('proposals')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new AppError(500, 'Failed to fetch proposals');
  res.json({ proposals: data, total: count });
});

router.post(
  '/proposals',
  body('client_name').isString().trim().isLength({ min: 2 }),
  body('line_items').isArray({ min: 1 }),
  body('line_items.*.description').isString().trim(),
  body('line_items.*.quantity').isNumeric(),
  body('line_items.*.unit_price').isNumeric(),
  body('valid_until').optional().isISO8601(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const supabase = getSupabase();

    // Get current tax rate
    const { data: taxRate } = await supabase
      .from('tax_rates')
      .select('*')
      .eq('jurisdiction', 'IN')
      .is('effective_until', null)
      .single();

    const taxPercent = taxRate?.rate_percent ?? 18;

    // Compute totals server-side — never trust client totals
    const lineItems = req.body.line_items as Array<{
      description: string; quantity: number; unit_price: number;
    }>;
    const lineItemsWithTotals = lineItems.map(item => ({
      ...item,
      subtotal: parseFloat((item.quantity * item.unit_price).toFixed(2)),
    }));
    const subtotal = parseFloat(lineItemsWithTotals.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
    const taxAmount = parseFloat((subtotal * taxPercent / 100).toFixed(2));
    const total = parseFloat((subtotal + taxAmount).toFixed(2));

    const { data: proposal, error } = await supabase
      .from('proposals')
      .insert({
        client_name: req.body.client_name,
        client_email: req.body.client_email ?? null,
        lead_id: req.body.lead_id ?? null,
        client_id: req.body.client_id ?? null,
        line_items: lineItemsWithTotals,
        custom_scope: req.body.custom_scope ?? null,
        subtotal,
        tax_rate_id: taxRate?.id ?? null,
        tax_percent: taxPercent,
        tax_amount: taxAmount,
        total,
        valid_until: req.body.valid_until ?? null,
        notes: req.body.notes ?? null,
      })
      .select()
      .single();

    if (error || !proposal) throw new AppError(500, 'Failed to create proposal', error?.message);

    await audit({
      event_type: 'proposal.created',
      entity_type: 'proposal',
      entity_id: proposal.id,
      actor: req.auth?.sub ?? 'system',
      description: `Proposal created for ${proposal.client_name} — ₹${total.toLocaleString('en-IN')}`,
      metadata: { total, tax_percent: taxPercent },
    });

    res.status(201).json({ proposal });
  }
);

router.get('/proposals/:id/pdf', param('id').isUUID(), async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data: proposal } = await supabase.from('proposals').select('*').eq('id', req.params.id).single();
  if (!proposal) throw new AppError(404, 'Proposal not found');

  const pdfBuffer = await buildProposalPDF(proposal);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="proposal-${proposal.id.slice(0,8)}.pdf"`,
  });
  res.send(pdfBuffer);
});

// ── Invoices ──────────────────────────────────────────────────
router.get('/invoices', async (_req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error, count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new AppError(500, 'Failed to fetch invoices');
  res.json({ invoices: data, total: count });
});

router.post(
  '/invoices',
  body('client_name').isString().trim(),
  body('proposal_id').optional().isUUID(),
  body('line_items').isArray({ min: 1 }),
  body('due_date').isISO8601(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const supabase = getSupabase();
    const { data: taxRate } = await supabase.from('tax_rates').select('*').eq('jurisdiction', 'IN').is('effective_until', null).single();
    const taxPercent = taxRate?.rate_percent ?? 18;

    const lineItems = req.body.line_items as Array<{ description: string; quantity: number; unit_price: number }>;
    const lineItemsWithTotals = lineItems.map(i => ({ ...i, subtotal: parseFloat((i.quantity * i.unit_price).toFixed(2)) }));
    const subtotal = parseFloat(lineItemsWithTotals.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
    const taxAmount = parseFloat((subtotal * taxPercent / 100).toFixed(2));
    const total = parseFloat((subtotal + taxAmount).toFixed(2));

    // Get sequential invoice number
    const { data: numResult } = await supabase.rpc('next_invoice_number');
    const invoiceNumber = numResult ?? `YG-TEMP-${Date.now()}`;

    const { data: invoice, error } = await supabase.from('invoices').insert({
      invoice_number: invoiceNumber,
      client_name: req.body.client_name,
      client_email: req.body.client_email ?? null,
      client_id: req.body.client_id ?? null,
      proposal_id: req.body.proposal_id ?? null,
      line_items: lineItemsWithTotals,
      subtotal,
      tax_rate_id: taxRate?.id ?? null,
      tax_percent: taxPercent,
      tax_amount: taxAmount,
      total,
      balance_due: total,
      due_date: req.body.due_date,
      notes: req.body.notes ?? null,
    }).select().single();

    if (error || !invoice) throw new AppError(500, 'Failed to create invoice', error?.message);

    await audit({
      event_type: 'invoice.created',
      entity_type: 'invoice',
      entity_id: invoice.id,
      actor: req.auth?.sub ?? 'system',
      description: `Invoice ${invoiceNumber} created for ${invoice.client_name} — ₹${total.toLocaleString('en-IN')}`,
    });

    res.status(201).json({ invoice });
  }
);

router.post(
  '/invoices/:id/payments',
  param('id').isUUID(),
  body('amount').isNumeric().custom(v => parseFloat(v) > 0),
  body('payment_date').isISO8601(),
  body('payment_method').optional().isString(),
  body('reference').optional().isString(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const supabase = getSupabase();
    const { data: invoice } = await supabase.from('invoices').select('*').eq('id', req.params.id).single();
    if (!invoice) throw new AppError(404, 'Invoice not found');

    const { data: payment, error } = await supabase.from('payments').insert({
      invoice_id: req.params.id,
      amount: parseFloat(req.body.amount),
      payment_date: req.body.payment_date,
      payment_method: req.body.payment_method ?? 'bank_transfer',
      reference: req.body.reference ?? null,
      notes: req.body.notes ?? null,
      recorded_by: req.auth?.sub ?? 'founder',
      evidence_type: 'manual_entry',
    }).select().single();

    if (error || !payment) throw new AppError(500, 'Failed to record payment', error?.message);

    await audit({
      event_type: 'payment.recorded',
      entity_type: 'invoice',
      entity_id: req.params.id,
      actor: req.auth?.sub ?? 'system',
      description: `Payment of ₹${payment.amount.toLocaleString('en-IN')} recorded for invoice ${invoice.invoice_number}`,
    });

    res.status(201).json({ payment });
  }
);

router.get('/invoices/:id/pdf', param('id').isUUID(), async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', req.params.id).single();
  if (!invoice) throw new AppError(404, 'Invoice not found');

  const pdfBuffer = await buildInvoicePDF(invoice);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoice.invoice_number}.pdf"` });
  res.send(pdfBuffer);
});

// ── Finance summary ───────────────────────────────────────────
router.get('/summary', async (_req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const [clients, invoices, payments] = await Promise.all([
    supabase.from('clients').select('monthly_value, status').eq('status', 'active'),
    supabase.from('invoices').select('total, balance_due, status').neq('status', 'void').neq('status', 'cancelled'),
    supabase.from('payments').select('amount, payment_date').gte('payment_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),
  ]);

  const mrr = (clients.data ?? []).reduce((s, c) => s + parseFloat(c.monthly_value ?? 0), 0);
  const outstanding = (invoices.data ?? []).filter(i => ['sent','partially_paid','overdue'].includes(i.status)).reduce((s, i) => s + parseFloat(i.balance_due ?? 0), 0);
  const collected_this_month = (payments.data ?? []).reduce((s, p) => s + parseFloat(p.amount ?? 0), 0);

  res.json({
    mrr: parseFloat(mrr.toFixed(2)),
    outstanding: parseFloat(outstanding.toFixed(2)),
    collected_this_month: parseFloat(collected_this_month.toFixed(2)),
    active_clients: (clients.data ?? []).length,
    disclaimer: 'Internal reference only. Consult a qualified CA for financial/tax compliance.',
    generated_at: new Date().toISOString(),
  });
});

export default router;
