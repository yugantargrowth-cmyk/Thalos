import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { getSupabase } from '../../lib/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import { buildProposalPDF, buildInvoicePDF } from '../../business/proposals/pdfBuilder.js';
import { financeService } from '../../business/financeService.js';
import { reportingService } from '../../business/reportingService.js';

const router = Router();

// ── Proposals ─────────────────────────────────────────────────
router.get('/proposals', async (_req: Request, res: Response): Promise<void> => {
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

    try {
      const proposal = await financeService.createProposal({
        client_name: req.body.client_name,
        client_email: req.body.client_email ?? null,
        lead_id: req.body.lead_id ?? null,
        client_id: req.body.client_id ?? null,
        line_items: req.body.line_items,
        custom_scope: req.body.custom_scope ?? null,
        tax_rate_id: taxRate?.id ?? null,
        tax_percent: taxPercent,
        valid_until: req.body.valid_until ?? null,
        notes: req.body.notes ?? null,
      }, req.auth?.sub ?? 'system');

      res.status(201).json({ proposal });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(500, 'Failed to create proposal', msg);
    }
  }
);

router.get('/proposals/:id/pdf', param('id').isUUID(), async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data: proposal } = await supabase.from('proposals').select('*').eq('id', req.params.id).single();
  if (!proposal) throw new AppError(404, 'Proposal not found');

  const pdfBuffer = await buildProposalPDF(proposal);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="proposal-${proposal.id.slice(0, 8)}.pdf"`,
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
    const { data: taxRate } = await supabase
      .from('tax_rates')
      .select('*')
      .eq('jurisdiction', 'IN')
      .is('effective_until', null)
      .single();
    const taxPercent = taxRate?.rate_percent ?? 18;

    try {
      const invoice = await financeService.createInvoice({
        client_name: req.body.client_name,
        client_email: req.body.client_email ?? null,
        client_id: req.body.client_id ?? null,
        proposal_id: req.body.proposal_id ?? null,
        line_items: req.body.line_items,
        tax_rate_id: taxRate?.id ?? null,
        tax_percent: taxPercent,
        due_date: req.body.due_date,
        notes: req.body.notes ?? null,
      }, req.auth?.sub ?? 'system');

      res.status(201).json({ invoice });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(500, 'Failed to create invoice', msg);
    }
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

    try {
      const payment = await financeService.recordPayment({
        invoice_id: req.params.id as string,
        amount: parseFloat(req.body.amount),
        payment_date: req.body.payment_date,
        payment_method: req.body.payment_method ?? 'bank_transfer',
        reference: req.body.reference ?? null,
        notes: req.body.notes ?? null,
        evidence_type: 'manual_entry',
      }, req.auth?.sub ?? 'founder');

      res.status(201).json({ payment });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) throw new AppError(404, msg);
      if (msg.includes('exceeds') || msg.includes('already') || msg.includes('Cannot record')) {
        throw new AppError(400, msg);
      }
      throw new AppError(500, 'Failed to record payment', msg);
    }
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
  const rep = await reportingService.getRevenueReport();
  const supabase = getSupabase();
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const { data: monthPayments } = await supabase
    .from('payments')
    .select('amount')
    .gte('payment_date', startOfMonth);

  const collectedThisMonth = (monthPayments ?? []).reduce((s, p) => s + parseFloat(p.amount ?? 0), 0);

  res.json({
    mrr: rep.mrr,
    outstanding: rep.total_outstanding,
    collected_this_month: parseFloat(collectedThisMonth.toFixed(2)),
    active_clients: rep.active_clients,
    disclaimer: 'Internal reference only. Consult a qualified CA for financial/tax compliance.',
    generated_at: rep.generated_at,
  });
});

export default router;
