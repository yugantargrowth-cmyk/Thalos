import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportingService } from '../../src/business/reportingService.js';

const mockSelect = vi.fn();
const mockNeq = vi.fn();
const mockEq = vi.fn();

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      if (table === 'leads') {
        return { select: mockSelect };
      }
      if (table === 'clients') {
        return {
          select: () => ({
            eq: mockEq,
          }),
        };
      }
      if (table === 'invoices') {
        return {
          select: () => ({
            neq: () => ({
              neq: mockNeq,
            }),
          }),
        };
      }
      if (table === 'payments') {
        return {
          select: mockSelect,
        };
      }
      return { select: mockSelect };
    },
  }),
}));

describe('ReportingService — Live Business Reports (L12-AC-06)', () => {
  let reportingService: ReportingService;

  beforeEach(() => {
    vi.clearAllMocks();
    reportingService = new ReportingService();
  });

  describe('getPipelineReport', () => {
    it('computes pipeline metrics and conversion rate from persisted leads', async () => {
      const mockLeads = [
        { stage: 'new', estimated_value: 50000, created_at: '2026-11-01' },
        { stage: 'qualified', estimated_value: 75000, created_at: '2026-11-02' },
        { stage: 'proposal_sent', estimated_value: 100000, created_at: '2026-11-03' },
        { stage: 'won', estimated_value: 120000, created_at: '2026-11-04' },
      ];
      mockSelect.mockResolvedValueOnce({ data: mockLeads, error: null });

      const report = await reportingService.getPipelineReport();

      expect(report.total_leads).toBe(4);
      expect(report.stage_counts).toEqual({
        new: 1,
        qualified: 1,
        proposal_sent: 1,
        won: 1,
      });
      expect(report.total_pipeline_value).toBe(345000);
      expect(report.conversion_rate_percent).toBe(25); // 1 won / 4 total
      expect(report.data_freshness).toBe('live_query');
      expect(report.generated_at).toBeDefined();
    });

    it('handles empty database with zero leads cleanly without division by zero', async () => {
      mockSelect.mockResolvedValueOnce({ data: [], error: null });

      const report = await reportingService.getPipelineReport();

      expect(report.total_leads).toBe(0);
      expect(report.total_pipeline_value).toBe(0);
      expect(report.conversion_rate_percent).toBe(0);
      expect(report.stage_counts).toEqual({});
    });
  });

  describe('getRevenueReport', () => {
    it('computes MRR, collections, outstanding balance, and collection ratio', async () => {
      const mockClients = [
        { monthly_value: 25000, status: 'active' },
        { monthly_value: 35000, status: 'active' },
      ];
      const mockInvoices = [
        { total: 50000, balance_due: 0, status: 'paid' },
        { total: 60000, balance_due: 20000, status: 'partially_paid' },
        { total: 30000, balance_due: 30000, status: 'sent' },
      ];
      const mockPayments = [
        { amount: 50000 },
        { amount: 40000 },
      ];

      mockEq.mockResolvedValueOnce({ data: mockClients, error: null });
      mockNeq.mockResolvedValueOnce({ data: mockInvoices, error: null });
      mockSelect.mockResolvedValueOnce({ data: mockPayments, error: null });

      const report = await reportingService.getRevenueReport();

      expect(report.active_clients).toBe(2);
      expect(report.mrr).toBe(60000); // 25000 + 35000
      expect(report.total_invoiced).toBe(140000); // 50000 + 60000 + 30000
      expect(report.total_collected).toBe(90000); // 50000 + 40000
      expect(report.total_outstanding).toBe(50000); // 20000 + 30000
      expect(report.collection_ratio_percent).toBe(64.29); // 90000 / 140000 = 64.2857%
      expect(report.disclaimer).toContain('Internal reference only');
    });

    it('handles zero invoices/clients gracefully', async () => {
      mockEq.mockResolvedValueOnce({ data: [], error: null });
      mockNeq.mockResolvedValueOnce({ data: [], error: null });
      mockSelect.mockResolvedValueOnce({ data: [], error: null });

      const report = await reportingService.getRevenueReport();

      expect(report.active_clients).toBe(0);
      expect(report.mrr).toBe(0);
      expect(report.total_invoiced).toBe(0);
      expect(report.total_collected).toBe(0);
      expect(report.total_outstanding).toBe(0);
      expect(report.collection_ratio_percent).toBe(0);
    });
  });
});
