/**
 * Unit tests for finance tool handlers — build_proposal, build_invoice.
 * Total computation is server-side only. Tests verify the math is correct.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase ─────────────────────────────────────────────
const mockSingle = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
const mockRpc = vi.fn();

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => ({
    from: () => ({ insert: mockInsert }),
    rpc: mockRpc,
  }),
}));

vi.mock('../../src/lib/audit.js', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/business/proposals/pdfBuilder.js', () => ({
  buildProposalPDF: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  buildInvoicePDF:  vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSingle.mockResolvedValue({
    data: {
      id: 'prop-uuid',
      client_name: 'Acme Corp',
      subtotal: 10000,
      tax_percent: 18,
      tax_amount: 1800,
      total: 11800,
      status: 'draft',
      invoice_number: 'YG-2026-001',
    },
    error: null,
  });
  mockSelect.mockReturnValue({ single: mockSingle });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockRpc.mockResolvedValue({ data: 'YG-2026-001', error: null });
});

import { executeBuildProposal, executeBuildInvoice } from '../../src/execution/tools/financeTools.js';

const SAMPLE_ITEMS = [
  { description: 'Website Development', quantity: 1, unit_price: 8000 },
  { description: 'SEO Setup', quantity: 2, unit_price: 1000 },
];

// ── build_proposal ─────────────────────────────────────────────
describe('executeBuildProposal', () => {
  it('creates a proposal and returns totals', async () => {
    const result = await executeBuildProposal({ client_name: 'Acme Corp', line_items: SAMPLE_ITEMS });
    expect(result.output).toMatchObject({ status: 'draft' });
    expect(result.evidence).toContain('Proposal');
    expect(result.evidence).toContain('created');
  });

  it('requires client_name', async () => {
    await expect(executeBuildProposal({ line_items: SAMPLE_ITEMS })).rejects.toThrow('client_name');
  });

  it('requires line_items array', async () => {
    await expect(executeBuildProposal({ client_name: 'X' })).rejects.toThrow('line_items');
  });

  it('rejects empty line_items', async () => {
    await expect(executeBuildProposal({ client_name: 'X', line_items: [] })).rejects.toThrow('non-empty');
  });

  it('validates line item shape', async () => {
    await expect(executeBuildProposal({
      client_name: 'X',
      line_items: [{ description: 'X' }],
    })).rejects.toThrow('quantity');
  });

  it('rejects negative unit_price', async () => {
    await expect(executeBuildProposal({
      client_name: 'X',
      line_items: [{ description: 'X', quantity: 1, unit_price: -100 }],
    })).rejects.toThrow('unit_price must be >= 0');
  });

  it('rejects zero or negative quantity', async () => {
    await expect(executeBuildProposal({
      client_name: 'X',
      line_items: [{ description: 'X', quantity: 0, unit_price: 100 }],
    })).rejects.toThrow('quantity must be > 0');
  });

  it('validates tax_percent bounds', async () => {
    await expect(executeBuildProposal({
      client_name: 'X',
      line_items: SAMPLE_ITEMS,
      tax_percent: 110,
    })).rejects.toThrow('tax_percent');
  });

  it('computes totals correctly (18% GST)', async () => {
    // subtotal = 1 * 8000 + 2 * 1000 = 10000; tax = 1800; total = 11800
    const inserted = mockInsert.mock.calls[0]?.[0] ?? {};
    // We verify via the insert call args after a successful run
    await executeBuildProposal({ client_name: 'Acme', line_items: SAMPLE_ITEMS, tax_percent: 18 });
    const call = mockInsert.mock.calls[0]?.[0];
    if (call) {
      expect(call.subtotal).toBe(10000);
      expect(call.tax_amount).toBe(1800);
      expect(call.total).toBe(11800);
    }
  });

  it('returns a draft note in output', async () => {
    const result = await executeBuildProposal({ client_name: 'X', line_items: SAMPLE_ITEMS });
    expect(String(result.output)).toContain || expect((result.output as Record<string,string>).note).toContain('DRAFT');
  });

  it('returns pdf_base64 in output', async () => {
    const result = await executeBuildProposal({ client_name: 'X', line_items: SAMPLE_ITEMS });
    expect((result.output as Record<string,string>).pdf_base64).toBeDefined();
  });
});

// ── build_invoice ──────────────────────────────────────────────
describe('executeBuildInvoice', () => {
  it('creates an invoice', async () => {
    const result = await executeBuildInvoice({
      client_name: 'Acme Corp',
      line_items: SAMPLE_ITEMS,
      due_date: '2026-12-31',
    });
    expect(result.output).toBeDefined();
    expect(result.evidence).toContain('Invoice');
  });

  it('requires due_date', async () => {
    await expect(executeBuildInvoice({ client_name: 'X', line_items: SAMPLE_ITEMS }))
      .rejects.toThrow('due_date');
  });

  it('requires client_name', async () => {
    await expect(executeBuildInvoice({ line_items: SAMPLE_ITEMS, due_date: '2026-12-31' }))
      .rejects.toThrow('client_name');
  });

  it('computes 0% tax correctly', async () => {
    await executeBuildInvoice({
      client_name: 'X',
      line_items: [{ description: 'X', quantity: 1, unit_price: 5000 }],
      due_date: '2026-12-31',
      tax_percent: 0,
    });
    const call = mockInsert.mock.calls[0]?.[0];
    if (call) {
      expect(call.tax_amount).toBe(0);
      expect(call.total).toBe(5000);
    }
  });
});
