import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTool } from '../../src/execution/toolDispatcher.js';
import { agentService, CANONICAL_AGENTS } from '../../src/intelligence/agentService.js';
import { validateToolInput } from '../../src/intelligence/toolRegistry.js';

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

describe('Mission 3: Business Partner, Agents, Tools & Real Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Canonical 9 Agents Audit & Governance', () => {
    it('verifies all 9 canonical agents are defined and strictly governed', () => {
      const expectedAgents = [
        'thalos',
        'scout',
        'hunter',
        'closer',
        'operator',
        'spark',
        'publisher',
        'analyst',
        'researcher',
      ];
      expect(CANONICAL_AGENTS).toHaveLength(9);
      expect(CANONICAL_AGENTS).toEqual(expectedAgents);

      expectedAgents.forEach((agentId) => {
        expect(agentService.isCanonicalAgent(agentId)).toBe(true);
      });
      expect(agentService.isCanonicalAgent('unauthorized_subagent')).toBe(false);
    });

    it('enforces that THALOS is the exclusive founder-facing orchestrator', () => {
      expect(() => agentService.assertFounderFacingOrchestrator('thalos')).not.toThrow();
      const specialists = ['scout', 'hunter', 'closer', 'operator', 'spark', 'publisher', 'analyst', 'researcher'];
      specialists.forEach((specialist) => {
        expect(() => agentService.assertFounderFacingOrchestrator(specialist)).toThrow(
          /Specialist agent '.*' cannot bypass orchestrator/
        );
      });
    });
  });

  describe('2. Tool Schema & Input Validation', () => {
    it('validates required inputs for create_lead', () => {
      const valid = validateToolInput('create_lead', {
        name: 'TechFlow Solutions',
        phone: '+919876543210',
        contact_name: 'Aarav Patel',
        email: 'aarav@techflow.io',
      });
      expect(valid.valid).toBe(true);

      const invalid = validateToolInput('create_lead', {
        // Missing name and phone
        email: 'aarav@techflow.io',
      });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.length).toBeGreaterThan(0);
    });

    it('validates required inputs for build_invoice', () => {
      const valid = validateToolInput('build_invoice', {
        client_name: 'Acme Corp',
        due_date: '2026-12-01',
        line_items: [
          {
            description: 'Monthly SEO Retainer',
            quantity: 1,
            unit_price: 50000,
          },
        ],
      });
      expect(valid.valid).toBe(true);

      const invalid = validateToolInput('build_invoice', {
        client_name: 'Acme Corp',
        // Missing due_date and line_items
      });
      expect(invalid.valid).toBe(false);
    });
  });

  describe('3. Server-Side Approval Enforcement (Outbound & Financial Actions)', () => {
    it('strictly queues send_email into approval_queue and prevents direct execution', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tools') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: {
                    tool_id: 'send_email',
                    display_name: 'Send Outbound Email',
                    status: 'available',
                    permission_level: 2,
                    requires_approval: true,
                    idempotent: false,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'agents') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: {
                    allowed_tools: ['send_email'],
                    prohibited_actions: [],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'tool_executions') {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'exec-send-1' }, error: null }),
              }),
            }),
            update: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          };
        }
        if (table === 'approval_queue') {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'appr-outbound-email-777' }, error: null }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) };
      });

      const result = await executeTool({
        tool_id: 'send_email',
        agent_id: 'hunter',
        inputs: {
          to: 'client@example.com',
          subject: 'Partnership Inquiry',
          html: '<p>Hello from Yugantar Growth</p>',
        },
      });

      expect(result.success).toBe(true);
      expect(result.queued_for_approval).toBe(true);
      expect(result.approval_id).toBe('appr-outbound-email-777');
      expect(result.evidence).toContain('Queued for approval: appr-outbound-email-777');
    });

    it('strictly queues build_invoice into approval_queue', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tools') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: {
                    tool_id: 'build_invoice',
                    display_name: 'Generate Invoice',
                    status: 'available',
                    permission_level: 2,
                    requires_approval: true,
                    idempotent: false,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'agents') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: {
                    allowed_tools: ['build_invoice'],
                    prohibited_actions: [],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'tool_executions') {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'exec-inv-1' }, error: null }),
              }),
            }),
            update: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          };
        }
        if (table === 'approval_queue') {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'appr-invoice-999' }, error: null }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) };
      });

      const result = await executeTool({
        tool_id: 'build_invoice',
        agent_id: 'closer',
        inputs: {
          client_name: 'Acme Corp',
          due_date: '2026-12-01',
          line_items: [
            {
              description: 'Q4 Service Retainer',
              quantity: 1,
              unit_price: 50000,
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.queued_for_approval).toBe(true);
      expect(result.approval_id).toBe('appr-invoice-999');
    });
  });

  describe('4. Agent Tool Permissions & Prohibited Actions Boundaries', () => {
    it('blocks execution when an agent attempts to use an unassigned tool', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tools') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: {
                    tool_id: 'build_invoice',
                    display_name: 'Generate Invoice',
                    status: 'available',
                    permission_level: 2,
                    requires_approval: true,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'agents') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: {
                    // Scout only allowed discovery tools, NOT invoices
                    allowed_tools: ['web_search', 'website_audit'],
                    prohibited_actions: ['build_invoice'],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) };
      });

      const result = await executeTool({
        tool_id: 'build_invoice',
        agent_id: 'scout',
        inputs: {
          client_name: 'Random',
          due_date: '2026-12-01',
          line_items: [{ description: 'Test', quantity: 1, unit_price: 100 }],
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/explicitly prohibited for agent scout|is not permitted to use tool/);
    });
  });

  describe('5. Direct Tool Execution with Evidence Capture', () => {
    it('executes create_task and returns durable output and evidence', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tools') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: {
                    tool_id: 'create_task',
                    display_name: 'Create Task',
                    status: 'available',
                    permission_level: 1,
                    requires_approval: false,
                    idempotent: false,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'agents') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: {
                    allowed_tools: ['create_task'],
                    prohibited_actions: [],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'tasks') {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({
                  data: {
                    id: 'task-101',
                    title: 'Onboard Acme Corp Client',
                    status: 'pending',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'tool_executions') {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'exec-task-1' }, error: null }),
              }),
            }),
            update: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) };
      });

      const result = await executeTool({
        tool_id: 'create_task',
        agent_id: 'operator',
        inputs: {
          title: 'Onboard Acme Corp Client',
          priority: 'high',
        },
      });

      expect(result.success).toBe(true);
      expect(result.queued_for_approval).toBeUndefined();
      expect(result.evidence).toBeDefined();
    });
  });
});
