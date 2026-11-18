/**
 * Cross-Entity Business Integration Tests (L12-AC-08)
 * ─────────────────────────────────────────────────────────────
 * Validates the complete business operating lifecycle:
 * Lead -> Proposal -> Client (Won) -> Project -> Task -> Invoice -> Payment,
 * including state machine guarantees, rollback on illegal transitions, and
 * live business intelligence reporting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crmService } from '../../src/business/crmService.js';
import { financeService } from '../../src/business/financeService.js';
import { reportingService } from '../../src/business/reportingService.js';

// In-memory state store to emulate Supabase persistence for integration testing
let leadsStore: any[] = [];
let clientsStore: any[] = [];
let projectsStore: any[] = [];
let tasksStore: any[] = [];
let proposalsStore: any[] = [];
let invoicesStore: any[] = [];
let paymentsStore: any[] = [];

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => ({
    rpc: vi.fn().mockImplementation(async (fn: string) => {
      if (fn === 'next_invoice_number') {
        const num = `YG-2026-${String(invoicesStore.length + 1).padStart(3, '0')}`;
        return { data: num, error: null };
      }
      return { data: null, error: null };
    }),
    from: (table: string) => {
      let currentTable: any[];
      if (table === 'leads') currentTable = leadsStore;
      else if (table === 'clients') currentTable = clientsStore;
      else if (table === 'projects') currentTable = projectsStore;
      else if (table === 'tasks') currentTable = tasksStore;
      else if (table === 'proposals') currentTable = proposalsStore;
      else if (table === 'invoices') currentTable = invoicesStore;
      else if (table === 'payments') currentTable = paymentsStore;
      else currentTable = [];

      let filterField: string | null = null;
      let filterValue: any = null;
      let secondFilterField: string | null = null;
      let secondFilterValue: any = null;

      const queryBuilder: any = {
        insert: (record: any) => {
          const inserted = {
            id: record.id || `${table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            created_at: new Date().toISOString(),
            ...record,
          };
          currentTable.push(inserted);
          return {
            select: () => ({
              single: async () => ({ data: inserted, error: null }),
            }),
          };
        },
        update: (updates: any) => {
          return {
            eq: (field: string, val: any) => {
              const idx = currentTable.findIndex((item) => item[field] === val);
              if (idx !== -1) {
                currentTable[idx] = { ...currentTable[idx], ...updates, updated_at: new Date().toISOString() };
                const updated = currentTable[idx];
                return {
                  select: () => ({
                    single: async () => ({ data: updated, error: null }),
                  }),
                  single: async () => ({ data: updated, error: null }),
                };
              }
              return {
                select: () => ({
                  single: async () => ({ data: null, error: { message: 'Not found' } }),
                }),
                single: async () => ({ data: null, error: { message: 'Not found' } }),
              };
            },
          };
        },
        select: (_cols?: string) => {
          return {
            eq: (f: string, v: any) => {
              filterField = f;
              filterValue = v;
              return {
                eq: (f2: string, v2: any) => {
                  secondFilterField = f2;
                  secondFilterValue = v2;
                  return {
                    single: async () => {
                      const item = currentTable.find(
                        (i) => i[filterField!] === filterValue && i[secondFilterField!] === secondFilterValue
                      );
                      return { data: item || null, error: item ? null : { message: 'Not found' } };
                    },
                    maybeSingle: async () => {
                      const item = currentTable.find(
                        (i) => i[filterField!] === filterValue && i[secondFilterField!] === secondFilterValue
                      );
                      return { data: item || null, error: null };
                    },
                  };
                },
                single: async () => {
                  const item = currentTable.find((i) => i[filterField!] === filterValue);
                  return { data: item || null, error: item ? null : { message: 'Not found' } };
                },
                maybeSingle: async () => {
                  const item = currentTable.find((i) => i[filterField!] === filterValue);
                  return { data: item || null, error: null };
                },
                // For reporting
                then: (resolve: any) => {
                  const items = currentTable.filter((i) => i[filterField!] === filterValue);
                  resolve({ data: items, error: null });
                },
              };
            },
            neq: (f1: string, v1: any) => ({
              neq: (f2: string, v2: any) => ({
                then: (resolve: any) => {
                  const items = currentTable.filter((i) => i[f1] !== v1 && i[f2] !== v2);
                  resolve({ data: items, error: null });
                },
              }),
            }),
            single: async () => ({ data: currentTable[0] || null, error: null }),
            then: (resolve: any) => resolve({ data: currentTable, error: null }),
          };
        },
      };

      return queryBuilder;
    },
  }),
}));

describe('L12 Business Integration — Cross-Entity Lifecycle & Rollback (L12-AC-08)', () => {
  beforeEach(() => {
    leadsStore = [];
    clientsStore = [];
    projectsStore = [];
    tasksStore = [];
    proposalsStore = [];
    invoicesStore = [];
    paymentsStore = [];
  });

  it('executes full business lifecycle flow from lead generation to paid invoice', async () => {
    // 1. Create Lead
    const lead = await crmService.createLead({
      name: 'Zenith Dental Care',
      phone: '9876500000',
      contact_name: 'Dr. Zenith',
      email: 'zenith@example.com',
      industry: 'Healthcare',
      source: 'organic',
      estimated_value: 60000,
    });
    expect(lead.id).toBeDefined();
    expect(lead.phone).toBe('+919876500000');
    expect(lead.stage).toBe('new');

    // 2. Lead research & qualification
    await crmService.updateLead(lead.id, { stage: 'qualified' });
    expect(leadsStore.find((l) => l.id === lead.id)?.stage).toBe('qualified');

    // 3. Build Proposal for Lead
    const proposal = await financeService.createProposal({
      client_name: lead.name,
      lead_id: lead.id,
      line_items: [
        { description: 'Local SEO & Google Business Optimization', quantity: 1, unit_price: 30000 },
        { description: 'Social Media Management (12 posts/mo)', quantity: 1, unit_price: 20000 },
      ],
      tax_percent: 18,
    });
    expect(proposal.subtotal).toBe(50000);
    expect(proposal.tax_amount).toBe(9000);
    expect(proposal.total).toBe(59000);
    expect(proposal.status).toBe('draft');

    // 4. Convert Lead to Client (Agreement Won)
    const client = await crmService.createClient({
      business_name: lead.name,
      contact_name: lead.contact_name!,
      phone: lead.phone,
      email: lead.email,
      monthly_value: 50000,
      start_date: '2026-12-01',
      status: 'active',
      converted_from_lead_id: lead.id,
    });
    expect(client.id).toBeDefined();
    expect(client.status).toBe('active');
    // Verify lead was automatically transitioned to 'won'
    expect(leadsStore.find((l) => l.id === lead.id)?.stage).toBe('won');

    // 5. Create Project & Tasks for Client
    const project = await crmService.createProject({
      client_id: client.id,
      name: 'Zenith Growth Launch',
      due_date: '2026-12-31',
    });
    expect(project.id).toBeDefined();
    expect(project.status).toBe('planning');

    const task1 = await crmService.createTask({
      title: 'Audit Google Maps profile',
      project_id: project.id,
      priority: 'high',
    });
    expect(task1.id).toBeDefined();
    expect(task1.status).toBe('todo');

    // 6. Complete task
    const { task: completedTask } = await crmService.updateTask(task1.id, {
      status: 'completed',
    });
    expect(completedTask.status).toBe('completed');
    expect(completedTask.completed_date).toBeDefined();

    // 7. Create Invoice for Client
    const invoice = await financeService.createInvoice({
      client_name: client.business_name,
      client_id: client.id,
      proposal_id: proposal.id,
      due_date: '2026-12-15',
      line_items: [
        { description: 'December Retainer', quantity: 1, unit_price: 50000 },
      ],
      tax_percent: 18,
    });
    expect(invoice.invoice_number).toBe('YG-2026-001');
    expect(invoice.total).toBe(59000);
    expect(invoice.balance_due).toBe(59000);
    expect(invoice.status).toBe('draft');

    // 8. Invoice state transitions: draft -> approved -> sent
    const approvedInvoice = await financeService.updateInvoiceStatus(invoice.id, 'approved');
    expect(approvedInvoice.status).toBe('approved');

    const sentInvoice = await financeService.updateInvoiceStatus(invoice.id, 'sent');
    expect(sentInvoice.status).toBe('sent');

    // 9. Partial Payment
    const payment1 = await financeService.recordPayment({
      invoice_id: invoice.id,
      amount: 29000,
      payment_date: '2026-12-05',
      reference: 'UPI-ZENITH-01',
    });
    expect(payment1.amount).toBe(29000);

    const invoiceAfterPartPay = invoicesStore.find((i) => i.id === invoice.id);
    expect(invoiceAfterPartPay?.balance_due).toBe(30000);
    expect(invoiceAfterPartPay?.status).toBe('partially_paid');

    // 10. Final Payment
    const payment2 = await financeService.recordPayment({
      invoice_id: invoice.id,
      amount: 30000,
      payment_date: '2026-12-10',
      reference: 'NEFT-ZENITH-02',
    });
    expect(payment2.amount).toBe(30000);

    const invoiceAfterFinalPay = invoicesStore.find((i) => i.id === invoice.id);
    expect(invoiceAfterFinalPay?.balance_due).toBe(0);
    expect(invoiceAfterFinalPay?.status).toBe('paid');

    // 11. Verify Reporting accurately derives live metrics
    const pipelineRep = await reportingService.getPipelineReport();
    expect(pipelineRep.total_leads).toBe(1);
    expect(pipelineRep.conversion_rate_percent).toBe(100); // 1 won out of 1
    expect(pipelineRep.stage_counts.won).toBe(1);

    const revenueRep = await reportingService.getRevenueReport();
    expect(revenueRep.active_clients).toBe(1);
    expect(revenueRep.mrr).toBe(50000);
    expect(revenueRep.total_invoiced).toBe(59000);
    expect(revenueRep.total_collected).toBe(59000);
    expect(revenueRep.total_outstanding).toBe(0);
    expect(revenueRep.collection_ratio_percent).toBe(100);
  });

  it('guarantees rollback and state preservation upon failed or illegal business actions', async () => {
    // Create baseline invoice
    const invoice = await financeService.createInvoice({
      client_name: 'Beta Labs',
      due_date: '2026-12-20',
      line_items: [{ description: 'Ad Management', quantity: 1, unit_price: 20000 }],
      tax_percent: 18,
    });
    expect(invoice.total).toBe(23600);
    expect(invoice.balance_due).toBe(23600);
    expect(invoice.status).toBe('draft');

    // 1. Rollback on illegal direct state jump (draft -> paid)
    await expect(
      financeService.updateInvoiceStatus(invoice.id, 'paid')
    ).rejects.toThrow("Invalid invoice state transition from 'draft' to 'paid'");
    // Verify invoice remains draft
    expect(invoicesStore.find((i) => i.id === invoice.id)?.status).toBe('draft');

    // Transition legitimately to sent
    await financeService.updateInvoiceStatus(invoice.id, 'approved');
    await financeService.updateInvoiceStatus(invoice.id, 'sent');

    // Record valid first payment
    await financeService.recordPayment({
      invoice_id: invoice.id,
      amount: 10000,
      payment_date: '2026-12-05',
      reference: 'TXN-UNIQUE-1',
    });
    expect(invoicesStore.find((i) => i.id === invoice.id)?.balance_due).toBe(13600);

    // 2. Rollback on duplicate payment reference
    await expect(
      financeService.recordPayment({
        invoice_id: invoice.id,
        amount: 5000,
        payment_date: '2026-12-06',
        reference: 'TXN-UNIQUE-1', // duplicate
      })
    ).rejects.toThrow("Payment with reference 'TXN-UNIQUE-1' has already been recorded");
    // Verify balance was NOT mutated
    expect(invoicesStore.find((i) => i.id === invoice.id)?.balance_due).toBe(13600);

    // 3. Rollback on overpayment
    await expect(
      financeService.recordPayment({
        invoice_id: invoice.id,
        amount: 20000, // exceeds remaining 13600
        payment_date: '2026-12-07',
        reference: 'TXN-OVERPAY',
      })
    ).rejects.toThrow('exceeds invoice balance due');
    // Verify balance remains 13600
    expect(invoicesStore.find((i) => i.id === invoice.id)?.balance_due).toBe(13600);

    // 4. Voiding invoice and preventing subsequent payments
    await financeService.updateInvoiceStatus(invoice.id, 'void');
    expect(invoicesStore.find((i) => i.id === invoice.id)?.status).toBe('void');

    await expect(
      financeService.recordPayment({
        invoice_id: invoice.id,
        amount: 1000,
        payment_date: '2026-12-08',
      })
    ).rejects.toThrow('Cannot record payment on a void invoice');
  });
});
