import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/api/app.js';
import { issueToken } from '../../src/api/middleware/auth.js';

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
  supabase: mockSupabase,
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn().mockImplementation((pin: string) => Promise.resolve(pin === '1234')),
  },
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/intelligence/llmClient.js', () => ({
  llmCall: vi.fn().mockResolvedValue({
    content: 'THALOS operational response.',
    tokens_used: 50,
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
  }),
  generateEmbedding: vi.fn().mockResolvedValue({ embedding: new Array(1536).fill(0.01) }),
}));

vi.mock('../../src/intelligence/orchestrator.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    thalosOrchestrate: vi.fn().mockResolvedValue({
      response: 'Acknowledged, founder. All operating systems active.',
      intent: 'general_question',
      action_status: 'none',
      actions_taken: [],
      pending_approvals: [],
      tokens_used: 35,
      model_used: 'groq/llama-3.3-70b-versatile',
    }),
  };
});

describe('Mission 5: Final Acceptance & End-to-End Founder Scenarios', () => {
  const app = createApp();
  const token = issueToken();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
  });

  describe('Scenario 1: Authentication, Token Vaulting & Protected Boundary', () => {
    it('authenticates founder with default dev PIN and grants Bearer JWT token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ pin: '1234' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.expires_in).toBeGreaterThan(0);
    });

    it('rejects unauthenticated requests to protected business endpoints', async () => {
      const endpoints = [
        ['get', '/api/leads'],
        ['get', '/api/clients'],
        ['get', '/api/approvals'],
        ['get', '/api/finance/invoices'],
        ['get', '/api/system/health'],
      ] as const;

      for (const [method, path] of endpoints) {
        const res = await (request(app) as any)[method](path);
        expect(res.status).toBe(401);
      }
    });
  });

  describe('Scenario 2: Companion Chat & Durable Interaction Lifecycle', () => {
    it('executes chat interaction returning durable message UUIDs and session date', async () => {
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: () => mockQueryBuilder,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        upsert: () => Promise.resolve({ data: null, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const res = await request(app)
        .post('/api/intelligence/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'What is our focus today, THALOS?' });

      expect(res.status).toBe(200);
      expect(res.body.conversation_id).toMatch(uuidRegex);
      expect(res.body.message_id).toMatch(uuidRegex);
      expect(res.body.user_message_id).toMatch(uuidRegex);
      expect(res.body.response).toContain('All operating systems active');
      expect(res.body.action_status).toBe('none');
    });
  });

  describe('Scenario 3: CRM Pipeline & Lead Progression', () => {
    it('creates and retrieves leads through canonical API routes', async () => {
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        insert: (data: any) => ({
          select: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'lead-test-101',
                name: data.name || 'Sterling Dynamics',
                phone: data.phone || '+919988776655',
                stage: 'new',
              },
              error: null,
            }),
          }),
        }),
        eq: () => mockQueryBuilder,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        order: () => ({
          range: () => Promise.resolve({
            data: [
              { id: 'lead-test-101', name: 'Sterling Dynamics', stage: 'new' },
            ],
            count: 1,
            error: null,
          }),
        }),
      };
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      // 1. Create lead
      const createRes = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Sterling Dynamics',
          phone: '+919988776655',
          email: 'vikram@sterling.in',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.lead.id).toBe('lead-test-101');

      // 2. Fetch leads list
      const listRes = await request(app)
        .get('/api/leads')
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.leads).toHaveLength(1);
      expect(listRes.body.leads[0].name).toBe('Sterling Dynamics');
    });
  });

  describe('Scenario 4: Approval Gate Execution & Action Dispatching', () => {
    it('retrieves pending approval queue items and allows resolution', async () => {
      const testApprovalId = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: () => mockQueryBuilder,
        order: () => ({
          limit: () => Promise.resolve({
            data: [
              {
                id: testApprovalId,
                action: 'Send Outbound Email by hunter',
                agent: 'hunter',
                target_name: 'Sterling Dynamics',
                status: 'pending',
                payload: { to: 'vikram@sterling.in', subject: 'Partnership' },
              },
            ],
            count: 1,
            error: null,
          }),
        }),
        single: () => Promise.resolve({
          data: {
            id: testApprovalId,
            action: 'Send Outbound Email by hunter',
            status: 'pending',
          },
          error: null,
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: () => Promise.resolve({
                  data: {
                    id: testApprovalId,
                    status: 'rejected',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      // 1. Inspect approval queue
      const listRes = await request(app)
        .get('/api/approvals')
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.approvals).toHaveLength(1);
      expect(listRes.body.approvals[0].action).toContain('hunter');

      // 2. Reject unapproved action
      const rejectRes = await request(app)
        .post(`/api/approvals/${testApprovalId}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Tone requires more formal greeting' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.status).toBe('rejected');
    });
  });

  describe('Scenario 5: Finance & Payment Verification', () => {
    it('records payment transaction against an invoice', async () => {
      const invoiceId = 'a56a4180-65aa-42ec-a945-5fd21dec0538';
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: () => mockQueryBuilder,
        single: () => Promise.resolve({
          data: {
            id: invoiceId,
            invoice_number: 'INV-2026-0044',
            status: 'issued',
            total: 50000,
            balance_due: 50000,
          },
          error: null,
        }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'pay-777',
                invoice_id: invoiceId,
                amount: 50000,
                reference: 'HDFC987654321012',
                status: 'completed',
              },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ data: null, error: null }),
        }),
      };
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const res = await request(app)
        .post(`/api/finance/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 50000,
          payment_date: '2026-11-26',
          reference: 'HDFC987654321012',
        });

      expect(res.status).toBe(201);
      expect(res.body.payment).toBeDefined();
      expect(res.body.payment.reference).toBe('HDFC987654321012');
    });
  });

  describe('Scenario 6: Worker Queue Telemetry & Dead-Letter Replay', () => {
    it('returns worker queue metrics and allows dead-letter retry', async () => {
      mockSupabase.from.mockReturnValue({
        update: () => ({
          eq: () => ({
            select: () => Promise.resolve({
              data: [{ id: 'job-dead-1' }],
              error: null,
            }),
          }),
        }),
      });

      // 1. Queue status
      const statusRes = await request(app)
        .get('/api/system/queue')
        .set('Authorization', `Bearer ${token}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.queue).toBeDefined();

      // 2. Dead-letter retry
      const retryRes = await request(app)
        .post('/api/system/queue/retry-dead-letter')
        .set('Authorization', `Bearer ${token}`);

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.retried_count).toBe(1);
    });
  });

  describe('Scenario 7: Settings & Integration Vault Management', () => {
    it('updates integration credentials in server vault securely', async () => {
      mockSupabase.from.mockReturnValue({
        upsert: () => Promise.resolve({ data: null, error: null }),
      });

      const res = await request(app)
        .post('/api/integrations/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'groq',
          apiKey: 'gsk_test_api_key_valid_1234567890',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
