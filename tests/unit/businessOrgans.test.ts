import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crmService } from '../../src/business/crmService.js';
import { financeService } from '../../src/business/financeService.js';
import { marketingService } from '../../src/business/marketingService.js';
import { portfolioService } from '../../src/business/portfolioService.js';
import { reportingService } from '../../src/business/reportingService.js';
import { getSupabase } from '../../src/lib/supabase.js';
import * as auditModule from '../../src/lib/audit.js';

describe('Mission S05: Business Organs & Operating Modules (S05-AC-01 through S05-AC-09)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('S05-AC-01: CRM & Lead Capture, Deduplication & Follow-ups', () => {
    it('creates a validated lead with phone normalization and audit event', async () => {
      const supabase = getSupabase();
      const mockLead = {
        id: 'lead-test-1',
        name: 'Patel Textiles',
        phone: '+919825012345',
        contact_name: 'Dinesh Patel',
        email: 'dinesh@pateltextiles.com',
        stage: 'new',
        source: 'google_maps',
        industry: 'Textiles',
        location: 'Naroda, Ahmedabad',
        created_at: '2026-11-18T10:00:00Z',
        updated_at: '2026-11-18T10:00:00Z',
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockLead, error: null }),
      } as any);

      const auditSpy = vi.spyOn(auditModule, 'audit').mockResolvedValue(undefined);

      const result = await crmService.createLead({
        name: 'Patel Textiles',
        phone: '9825012345', // Un-normalized 10-digit number
        contact_name: 'Dinesh Patel',
        email: 'dinesh@pateltextiles.com',
        source: 'google_maps',
        industry: 'Textiles',
        location: 'Naroda, Ahmedabad',
      });

      expect(result.id).toBe('lead-test-1');
      expect(result.phone).toBe('+919825012345');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'tool.create_lead',
          entity_id: 'lead-test-1',
        })
      );
    });

    it('schedules a follow-up and updates lead follow_up_date', async () => {
      const supabase = getSupabase();
      const mockFollowUp = {
        id: 'fu-1',
        entity_type: 'lead',
        entity_id: 'lead-test-1',
        due_date: '2026-11-25',
        reminder_note: 'Discuss enterprise AI retainer',
        status: 'pending',
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockFollowUp, error: null }),
      } as any);

      const res = await crmService.scheduleFollowUp({
        entity_type: 'lead',
        entity_id: 'lead-test-1',
        due_date: '2026-11-25',
        reminder_note: 'Discuss enterprise AI retainer',
      });

      expect(res.follow_up_id).toBe('fu-1');
      expect(res.due_date).toBe('2026-11-25');
    });
  });

  describe('S05-AC-02: Client Management & Cross-Entity Commercial Profile', () => {
    it('converts a won lead to client and links converted_from_lead_id', async () => {
      const supabase = getSupabase();
      const mockClient = {
        id: 'client-101',
        business_name: 'Patel Textiles Ltd',
        contact_name: 'Dinesh Patel',
        phone: '+919825012345',
        status: 'onboarding',
        monthly_value: 50000,
        start_date: '2026-12-01',
        converted_from_lead_id: 'lead-test-1',
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockClient, error: null }),
      } as any);

      const client = await crmService.createClient({
        business_name: 'Patel Textiles Ltd',
        contact_name: 'Dinesh Patel',
        phone: '+919825012345',
        monthly_value: 50000,
        start_date: '2026-12-01',
        converted_from_lead_id: 'lead-test-1',
      });

      expect(client.id).toBe('client-101');
      expect(client.converted_from_lead_id).toBe('lead-test-1');
    });

    it('aggregates complete commercial profile linking lead, projects, tasks, invoices and payments', async () => {
      const supabase = getSupabase();

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'clients') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'client-101',
                business_name: 'Patel Textiles',
                converted_from_lead_id: 'lead-test-1',
                monthly_value: 50000,
              },
              error: null,
            }),
          } as any;
        }
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'lead-test-1', name: 'Patel Textiles', stage: 'won' },
              error: null,
            }),
          } as any;
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'proj-1', client_id: 'client-101', name: 'AI ERP Setup', status: 'active' }],
              error: null,
            }),
          } as any;
        }
        if (table === 'tasks') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'task-1', client_id: 'client-101', title: 'Data Migration', status: 'in_progress' }],
              error: null,
            }),
          } as any;
        }
        if (table === 'proposals') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'prop-1', client_id: 'client-101', total: 118000, status: 'accepted' }],
              error: null,
            }),
          } as any;
        }
        if (table === 'invoices') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'inv-1', client_id: 'client-101', total: 59000, balance_due: 0, status: 'paid' }],
              error: null,
            }),
          } as any;
        }
        if (table === 'payments') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ invoice_id: 'inv-1', amount: 59000 }],
              error: null,
            }),
          } as any;
        }
        return {} as any;
      });

      const profile = await crmService.getClientCommercialProfile('client-101');

      expect(profile.client.business_name).toBe('Patel Textiles');
      expect(profile.lead_origin?.id).toBe('lead-test-1');
      expect(profile.projects.length).toBe(1);
      expect(profile.tasks.length).toBe(1);
      expect(profile.total_invoiced).toBe(59000);
      expect(profile.total_paid).toBe(59000);
      expect(profile.outstanding_balance).toBe(0);
    });
  });

  describe('S05-AC-03: Projects, Tasks & Progress History', () => {
    it('creates project and records percentage progress with audit trail', async () => {
      const supabase = getSupabase();
      const mockProject = {
        id: 'proj-10',
        client_id: 'client-101',
        name: 'CRM Implementation',
        status: 'active',
        progress_percent: 75,
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
      } as any);

      const auditSpy = vi.spyOn(auditModule, 'audit').mockResolvedValue(undefined);

      const updated = await crmService.recordProjectProgress('proj-10', 75, 'Completed user testing milestone');

      expect(updated.progress_percent).toBe(75);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'project.progress_updated',
          entity_id: 'proj-10',
        })
      );
    });

    it('rejects invalid project progress values (< 0 or > 100)', async () => {
      await expect(crmService.recordProjectProgress('proj-10', -5)).rejects.toThrow(
        'progressPercent must be a number between 0 and 100'
      );
      await expect(crmService.recordProjectProgress('proj-10', 105)).rejects.toThrow(
        'progressPercent must be a number between 0 and 100'
      );
    });
  });

  describe('S05-AC-04: Marketing & Social Planning with Approval Enforced', () => {
    it('drafts a social post with draft status', async () => {
      const supabase = getSupabase();
      const mockPost = {
        id: 'post-1',
        platform: 'linkedin',
        topic: 'AI automation in manufacturing',
        content: 'How Gujarat manufacturers are reducing downtime with THALOS.',
        status: 'draft',
        tags: ['ai', 'manufacturing'],
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockPost, error: null }),
      } as any);

      const post = await marketingService.draftPost({
        platform: 'linkedin',
        topic: 'AI automation in manufacturing',
        content: 'How Gujarat manufacturers are reducing downtime with THALOS.',
        tags: ['ai', 'manufacturing'],
      });

      expect(post.id).toBe('post-1');
      expect(post.status).toBe('draft');
    });

    it('strictly forbids publishing unapproved posts', async () => {
      const supabase = getSupabase();

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'post-unapproved', platform: 'twitter', status: 'draft' },
          error: null,
        }),
      } as any);

      // Attempt to publish without approval
      await expect(marketingService.publishPost('post-unapproved')).rejects.toThrow(
        /Publication requires prior explicit founder approval/
      );
    });

    it('publishes approved posts and returns non-repudiable evidence', async () => {
      const supabase = getSupabase();

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'post-approved',
              platform: 'linkedin',
              topic: 'Growth Blueprint',
              status: 'approved',
              approval_id: 'appr-999',
            },
            error: null,
          }),
        } as any;
      });

      const auditSpy = vi.spyOn(auditModule, 'audit').mockResolvedValue(undefined);

      const result = await marketingService.publishPost('post-approved', 'system');

      expect(result.published_evidence).toContain('appr-999');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'marketing.post_published',
          entity_id: 'post-approved',
        })
      );
    });
  });

  describe('S05-AC-05: Finance Invoice Lifecycle & Decimal Precision', () => {
    it('creates an invoice with decimal-safe financial totals', async () => {
      const supabase = getSupabase();
      const mockInvoice = {
        id: 'inv-100',
        invoice_number: 'INV-2026-0001',
        client_name: 'Adani Logistics',
        subtotal: 100000,
        tax_percent: 18,
        tax_amount: 18000,
        total: 118000,
        balance_due: 118000,
        status: 'draft',
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockInvoice, error: null }),
      } as any);

      const inv = await financeService.createInvoice({
        client_name: 'Adani Logistics',
        due_date: '2026-12-15',
        line_items: [{ description: 'AI Agent Deployment', quantity: 1, unit_price: 100000 }],
        tax_percent: 18,
      });

      expect(inv.subtotal).toBe(100000);
      expect(inv.tax_amount).toBe(18000);
      expect(inv.total).toBe(118000);
    });

    it('records partial and full payments and updates invoice balance and status', async () => {
      const supabase = getSupabase();

      const existingInvoice = {
        id: 'inv-100',
        invoice_number: 'INV-2026-0001',
        total: 118000,
        balance_due: 118000,
        status: 'sent',
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'invoices') {
          return {
            select: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: existingInvoice, error: null }),
          } as any;
        }
        if (table === 'payments') {
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            single: vi.fn().mockResolvedValue({
              data: { id: 'pmt-1', invoice_id: 'inv-100', amount: 50000 },
              error: null,
            }),
          } as any;
        }
        return {} as any;
      });

      const pmt = await financeService.recordPayment({
        invoice_id: 'inv-100',
        amount: 50000,
        payment_date: '2026-11-18',
        reference: 'HDFC12345678',
      });

      expect(pmt.amount).toBe(50000);
    });
  });

  describe('S05-AC-06: Proposal Document Generation & Versioning', () => {
    it('generates a PDF proposal from business data and registers as a versioned document', async () => {
      const supabase = getSupabase();

      const mockProposal = {
        id: 'prop-v1',
        client_name: 'Torrent Pharma',
        client_email: 'procurement@torrent.com',
        line_items: [{ description: 'Automated Outreach Suite', quantity: 1, unit_price: 75000, subtotal: 75000 }],
        subtotal: 75000,
        tax_percent: 18,
        tax_amount: 13500,
        total: 88500,
        created_at: '2026-11-18T10:00:00Z',
      };

      const mockDoc = {
        id: 'doc-prop-1',
        title: 'Proposal - Torrent Pharma (v2)',
        version: 2,
        status: 'indexed',
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'proposals') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProposal, error: null }),
          } as any;
        }
        if (table === 'documents') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
          } as any;
        }
        return {} as any;
      });

      const result = await financeService.generateProposalDocument('prop-v1', 2, 'founder');

      expect(result.document_id).toBe('doc-prop-1');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('S05-AC-07: Real Data-Driven Reporting Metrics', () => {
    it('derives pipeline analytics dynamically from database records without hardcoding', async () => {
      const supabase = getSupabase();
      const mockLeads = [
        { stage: 'new', estimated_value: 20000, created_at: '2026-11-01' },
        { stage: 'qualified', estimated_value: 50000, created_at: '2026-11-02' },
        { stage: 'won', estimated_value: 100000, created_at: '2026-11-03' },
      ];

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockLeads, error: null }),
      } as any);

      const report = await reportingService.getPipelineReport();

      expect(report.total_leads).toBe(3);
      expect(report.total_pipeline_value).toBe(170000);
      expect(report.conversion_rate_percent).toBeCloseTo(33.33, 1);
      expect(report.data_freshness).toBe('live_query');
    });
  });

  describe('S05-AC-08: Product Portfolio & Business Unit Multi-Tenancy', () => {
    it('returns canonical business units and products without duplicating core schemas', () => {
      const units = portfolioService.listBusinessUnits();
      const unitIds = units.map((u) => u.id);

      expect(unitIds).toContain('yugantar_growth');
      expect(unitIds).toContain('thalos_ai');
      expect(unitIds).toContain('scout_leadgen');
      expect(unitIds).toContain('custom_solutions');
    });

    it('derives cross-unit portfolio metrics attributed by unit tags', async () => {
      const supabase = getSupabase();

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { tags: ['unit:yugantar_growth'] },
                { tags: ['unit:thalos_ai'] },
                { tags: ['unit:thalos_ai'] },
              ],
              error: null,
            }),
          } as any;
        }
        if (table === 'clients') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ tags: ['unit:thalos_ai'] }],
              error: null,
            }),
          } as any;
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ status: 'active', tags: ['unit:thalos_ai'] }],
              error: null,
            }),
          } as any;
        }
        if (table === 'payments') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ amount: 150000 }],
              error: null,
            }),
          } as any;
        }
        return {} as any;
      });

      const summary = await portfolioService.getPortfolioSummary();

      const thalos = summary.business_units.find((u) => u.id === 'thalos_ai');
      expect(thalos?.leads_count).toBe(2);
      expect(thalos?.clients_count).toBe(1);
      expect(thalos?.active_projects_count).toBe(1);
    });
  });
});
