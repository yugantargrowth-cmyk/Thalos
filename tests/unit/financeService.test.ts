import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  round2,
  computeFinancialTotals,
  FinanceService,
  VALID_INVOICE_TRANSITIONS,
} from '../../src/business/financeService.js';
import type { InvoiceStatus } from '../../src/business/entities.js';

// Mocks
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => ({
    from: () => ({
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
    }),
    rpc: mockRpc,
  }),
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

describe('FinanceService — Decimal-safe Arithmetic (L12-AC-04)', () => {
  it('round2 rounds standard currency amounts correctly to 2 decimal places', () => {
    expect(round2(10.555)).toBe(10.56);
    expect(round2(10.554)).toBe(10.55);
    expect(round2(100)).toBe(100);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('computeFinancialTotals computes exact subtotals and 18% GST', () => {
    const lineItems = [
      { description: 'Social Media Management', quantity: 1, unit_price: 25000 },
      { description: 'Content Creation (Reels)', quantity: 4, unit_price: 3750 },
    ];
    const { items, subtotal, taxAmount, total } = computeFinancialTotals(lineItems, 18);

    expect(items).toHaveLength(2);
    expect(items[0].subtotal).toBe(25000);
    expect(items[1].subtotal).toBe(15000);
    expect(subtotal).toBe(40000);
    expect(taxAmount).toBe(7200);
    expect(total).toBe(47200);
  });

  it('computeFinancialTotals satisfies invariant ABS(total - (subtotal + tax_amount)) < 0.02', () => {
    const lineItems = [
      { description: 'Ad Spend Mgmt', quantity: 3, unit_price: 3333.33 },
    ];
    const { subtotal, taxAmount, total } = computeFinancialTotals(lineItems, 18);

    expect(Math.abs(total - (subtotal + taxAmount))).toBeLessThan(0.02);
  });

  it('rejects empty line items', () => {
    expect(() => computeFinancialTotals([], 18)).toThrow('non-empty array');
  });

  it('rejects line item with non-positive quantity', () => {
    expect(() =>
      computeFinancialTotals([{ description: 'Item', quantity: 0, unit_price: 100 }], 18)
    ).toThrow('quantity must be > 0');
    expect(() =>
      computeFinancialTotals([{ description: 'Item', quantity: -2, unit_price: 100 }], 18)
    ).toThrow('quantity must be > 0');
  });

  it('rejects line item with negative unit price', () => {
    expect(() =>
      computeFinancialTotals([{ description: 'Item', quantity: 1, unit_price: -50 }], 18)
    ).toThrow('unit_price must be >= 0');
  });

  it('rejects tax percentage out of bounds 0–100', () => {
    const lineItems = [{ description: 'Item', quantity: 1, unit_price: 1000 }];
    expect(() => computeFinancialTotals(lineItems, -5)).toThrow('tax_percent must be 0–100');
    expect(() => computeFinancialTotals(lineItems, 105)).toThrow('tax_percent must be 0–100');
  });
});

describe('FinanceService — Invoice & Payment State Transitions (L12-AC-05)', () => {
  let financeService: FinanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockReset();
    mockMaybeSingle.mockReset();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockEq.mockReset();

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    financeService = new FinanceService();

    const queryMock: any = {
      select: vi.fn(() => queryMock),
      eq: vi.fn(() => queryMock),
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    };
    mockSelect.mockReturnValue(queryMock);
    mockInsert.mockReturnValue(queryMock);
    mockUpdate.mockReturnValue(queryMock);
    mockEq.mockReturnValue(queryMock);
    mockRpc.mockResolvedValue({ data: 'YG-2026-042', error: null });
  });

  it('creates an invoice with sequential numbering and draft status', async () => {
    const mockInvoiceRow = {
      id: 'inv-uuid-1',
      invoice_number: 'YG-2026-042',
      client_name: 'Alpha Enterprises',
      subtotal: 10000,
      tax_amount: 1800,
      total: 11800,
      balance_due: 11800,
      due_date: '2026-12-31',
      status: 'draft',
    };
    mockSingle.mockResolvedValue({ data: mockInvoiceRow, error: null });

    const invoice = await financeService.createInvoice({
      client_name: 'Alpha Enterprises',
      due_date: '2026-12-31',
      line_items: [{ description: 'Strategy', quantity: 1, unit_price: 10000 }],
    });

    expect(invoice.invoice_number).toBe('YG-2026-042');
    expect(invoice.balance_due).toBe(11800);
    expect(invoice.status).toBe('draft');
  });

  it('enforces valid invoice state transitions and rejects illegal transitions', async () => {
    // Current status: draft
    mockSingle.mockResolvedValueOnce({
      data: { id: 'inv-1', invoice_number: 'YG-2026-001', status: 'draft' },
      error: null,
    });
    // Allowed transition: draft -> approved
    mockSingle.mockResolvedValueOnce({
      data: { id: 'inv-1', invoice_number: 'YG-2026-001', status: 'approved' },
      error: null,
    });

    const approved = await financeService.updateInvoiceStatus('inv-1', 'approved');
    expect(approved.status).toBe('approved');

    // Illegal transition: draft -> paid (must be approved and sent first)
    mockSingle.mockResolvedValueOnce({
      data: { id: 'inv-1', invoice_number: 'YG-2026-001', status: 'draft' },
      error: null,
    });
    await expect(
      financeService.updateInvoiceStatus('inv-1', 'paid')
    ).rejects.toThrow("Invalid invoice state transition from 'draft' to 'paid'");
  });

  it('rejects transitions from terminal states (cancelled, void)', () => {
    expect(VALID_INVOICE_TRANSITIONS['cancelled']).toHaveLength(0);
    expect(VALID_INVOICE_TRANSITIONS['void']).toHaveLength(0);
  });

  it('records partial payment, updates balance due, and sets status to partially_paid', async () => {
    const existingInvoice = {
      id: 'inv-2',
      invoice_number: 'YG-2026-002',
      total: 10000,
      balance_due: 10000,
      status: 'sent',
    };

    // First call: fetch invoice
    mockSingle.mockResolvedValueOnce({ data: existingInvoice, error: null });
    // Duplicate reference check returns null
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // Insert payment returns payment record
    const paymentRecord = {
      id: 'pay-1',
      invoice_id: 'inv-2',
      amount: 4000,
      payment_date: '2026-11-20',
      reference: 'UPI-REF-101',
    };
    mockSingle.mockResolvedValueOnce({ data: paymentRecord, error: null });

    const payment = await financeService.recordPayment({
      invoice_id: 'inv-2',
      amount: 4000,
      payment_date: '2026-11-20',
      reference: 'UPI-REF-101',
    });

    expect(payment.amount).toBe(4000);
    // Verify invoice update was called with newBalance = 6000 and status = partially_paid
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        balance_due: 6000,
        status: 'partially_paid',
      })
    );
  });

  it('records full payment, sets balance to 0, and status to paid', async () => {
    const existingInvoice = {
      id: 'inv-3',
      invoice_number: 'YG-2026-003',
      total: 5000,
      balance_due: 5000,
      status: 'sent',
    };

    mockSingle.mockResolvedValueOnce({ data: existingInvoice, error: null });
    mockSingle.mockResolvedValueOnce({
      data: { id: 'pay-2', invoice_id: 'inv-3', amount: 5000 },
      error: null,
    });

    await financeService.recordPayment({
      invoice_id: 'inv-3',
      amount: 5000,
      payment_date: '2026-11-20',
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        balance_due: 0,
        status: 'paid',
      })
    );
  });

  it('rejects overpayment where payment amount exceeds balance due', async () => {
    const existingInvoice = {
      id: 'inv-4',
      invoice_number: 'YG-2026-004',
      total: 5000,
      balance_due: 2000,
      status: 'partially_paid',
    };
    mockSingle.mockResolvedValueOnce({ data: existingInvoice, error: null });

    await expect(
      financeService.recordPayment({
        invoice_id: 'inv-4',
        amount: 3000,
        payment_date: '2026-11-20',
      })
    ).rejects.toThrow('exceeds invoice balance due');
  });

  it('rejects duplicate payment references for the same invoice', async () => {
    const existingInvoice = {
      id: 'inv-5',
      invoice_number: 'YG-2026-005',
      total: 10000,
      balance_due: 10000,
      status: 'sent',
    };
    mockSingle.mockResolvedValueOnce({ data: existingInvoice, error: null });
    // Duplicate reference check finds existing payment
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'pay-existing', reference: 'UTR-999' },
      error: null,
    });

    await expect(
      financeService.recordPayment({
        invoice_id: 'inv-5',
        amount: 5000,
        payment_date: '2026-11-20',
        reference: 'UTR-999',
      })
    ).rejects.toThrow("Payment with reference 'UTR-999' has already been recorded");
  });

  it('rejects payment on void or cancelled invoices', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'inv-void', invoice_number: 'YG-VOID', balance_due: 5000, status: 'void' as InvoiceStatus },
      error: null,
    });

    await expect(
      financeService.recordPayment({
        invoice_id: 'inv-void',
        amount: 1000,
        payment_date: '2026-11-20',
      })
    ).rejects.toThrow('Cannot record payment on a void invoice');
  });
});
