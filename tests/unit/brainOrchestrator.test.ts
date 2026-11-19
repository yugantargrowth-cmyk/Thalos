import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  thalosOrchestrate,
  classifyIntent,
  selectAgent,
  isComplexRequest,
  decomposeAndPlanTask,
  executeTaskPlan,
  type TaskPlan,
} from '../../src/intelligence/orchestrator.js';
import { agentService } from '../../src/intelligence/agentService.js';
import * as llmClientModule from '../../src/intelligence/llmClient.js';
import { getSupabase } from '../../src/lib/supabase.js';
import * as auditModule from '../../src/lib/audit.js';
import { config } from '../../src/lib/config.js';

describe('Mission S01: Brain (Central Cognitive Orchestrator & Planner)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    const supabase = getSupabase();
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'agents') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              system_instructions: 'You are Thalos.',
              allowed_tools: [],
              model_capability: 'fast',
            },
            error: null,
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any;
    });
  });

  describe('S01-AC-01 & S01-AC-02: Sole Conversational Entry Point & Context-Grounded Intent', () => {
    it('uses thalosOrchestrate as the central conversational entry point and routes correctly', async () => {
      const supabase = getSupabase();

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'agents') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                system_instructions: 'You are Thalos.',
                allowed_tools: [],
                model_capability: 'fast',
              },
              error: null,
            }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      vi.spyOn(llmClientModule, 'llmCall').mockResolvedValue({
        content: 'Here is the operational focus for today in Ahmedabad.',
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
        tokens_used: 42,
        finish_reason: 'stop',
      });

      const auditSpy = vi.spyOn(auditModule, 'audit').mockResolvedValue(undefined);

      const result = await thalosOrchestrate({
        message: 'What is our focus for today in Ahmedabad?',
        history: [],
        sessionDate: '2026-11-18',
      });

      expect(result.response).toContain('Here is the operational focus');
      expect(result.agent_id).toBe('thalos');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'intelligence.orchestrated',
          actor: 'founder',
        })
      );
    });

    it('classifies intents accurately across operational domains', () => {
      expect(selectAgent('lead_discovery')).toBe('scout');
      expect(selectAgent('outreach')).toBe('hunter');
      expect(selectAgent('research')).toBe('researcher');
      expect(selectAgent('deal_progression')).toBe('closer');
      expect(selectAgent('client_ops')).toBe('operator');
      expect(selectAgent('reporting')).toBe('analyst');
      expect(selectAgent('content')).toBe('spark');
      expect(selectAgent('general_question')).toBe('thalos');
    });
  });

  describe('S01-AC-03: Complex Task Decomposition & Specialist Agent Delegation', () => {
    it('detects complex multi-domain requests requiring planning', () => {
      expect(isComplexRequest('Research Acme Corp and draft an outreach email')).toBe(true);
      expect(isComplexRequest('Audit website for dental clinic and create lead')).toBe(true);
      expect(isComplexRequest('What is the weather today?')).toBe(false);
      expect(isComplexRequest('Show me pipeline summary')).toBe(false);
    });

    it('decomposes complex task into sequential subtasks with assigned specialist agents', async () => {
      const plan = await decomposeAndPlanTask('Research Acme Pharma and draft an outreach email for founder');

      expect(plan.is_complex).toBe(true);
      expect(plan.subtasks.length).toBe(2);

      // Step 1: Researcher
      expect(plan.subtasks[0].agent).toBe('researcher');
      expect(plan.subtasks[0].step).toBe(1);

      // Step 2: Hunter
      expect(plan.subtasks[1].agent).toBe('hunter');
      expect(plan.subtasks[1].step).toBe(2);
    });

    it('decomposes website inspection and lead capture task into researcher + scout subtasks', async () => {
      const plan = await decomposeAndPlanTask('Audit website https://example.com and create lead in CRM');

      expect(plan.is_complex).toBe(true);
      expect(plan.subtasks[0].agent).toBe('researcher');
      expect(plan.subtasks[1].agent).toBe('scout');
    });
  });

  describe('S01-AC-04 & S01-AC-08: Provenance, Status & Honest Outcome Differentiation', () => {
    it('executes task plan and produces honest summary distinguishing completed, pending, and failed work', async () => {
      const plan: TaskPlan = {
        plan_id: 'plan-test-101',
        goal: 'Research prospect and send proposal',
        is_complex: true,
        replan_count: 0,
        status: 'planned',
        subtasks: [
          {
            step: 1,
            description: 'Research company financials',
            agent: 'researcher',
            task_type: 'research_prospect',
            inputs: { company: 'Torrent' },
            status: 'pending',
          },
          {
            step: 2,
            description: 'Draft custom commercial proposal',
            agent: 'closer',
            task_type: 'draft_proposal',
            inputs: { client_name: 'Torrent' },
            status: 'pending',
          },
        ],
      };

      // Mock agent delegation: Step 1 completes, Step 2 awaits approval
      vi.spyOn(agentService, 'delegateTask')
        .mockResolvedValueOnce({
          delegation_id: 'del-1',
          from_agent: 'thalos',
          to_agent: 'researcher',
          status: 'completed',
          output: { annual_turnover: '500 Cr' },
          evidence: 'Verified via MCA portal',
          provenance: {
            agent_id: 'researcher',
            model_used: 'gemini-1.5-flash',
            tokens_used: 120,
            duration_ms: 450,
            tools_executed: ['web_search'],
          },
        })
        .mockResolvedValueOnce({
          delegation_id: 'del-2',
          from_agent: 'thalos',
          to_agent: 'closer',
          status: 'awaiting_approval',
          output: { proposal_id: 'prop-99' },
          evidence: 'Proposal drafted and queued for founder approval',
          provenance: {
            agent_id: 'closer',
            model_used: 'groq/llama-3.3-70b-versatile',
            tokens_used: 200,
            duration_ms: 600,
            tools_executed: ['build_proposal'],
          },
        });

      const result = await executeTaskPlan(plan);

      expect(result.plan.status).toBe('completed');
      expect(result.completedTasks).toContain('[researcher] Research company financials');
      expect(result.pendingApprovals).toContain('[closer] Draft custom commercial proposal');
      expect(result.summary).toContain('## Plan Execution Summary');
      expect(result.summary).toContain('Completed Actions:');
      expect(result.summary).toContain('Actions Pending Founder Approval:');
      expect(result.summary).not.toContain('Failed / Incomplete Actions'); // None failed
    });
  });

  describe('S01-AC-05: Intermediate Result Evaluation & Bounded Re-Planning', () => {
    it('evaluates intermediate failure and skips dependent steps within bounded re-plan count', async () => {
      const plan: TaskPlan = {
        plan_id: 'plan-replan-202',
        goal: 'Audit broken site and create lead',
        is_complex: true,
        replan_count: 0,
        status: 'planned',
        subtasks: [
          {
            step: 1,
            description: 'Audit unreachable website',
            agent: 'researcher',
            task_type: 'audit_website',
            inputs: { url: 'https://broken-domain-offline.xyz' },
            status: 'pending',
          },
          {
            step: 2,
            description: 'Extract leads from audit',
            agent: 'scout',
            task_type: 'create_lead_from_audit',
            inputs: {},
            status: 'pending',
          },
        ],
      };

      // Step 1 fails with host error
      vi.spyOn(agentService, 'delegateTask').mockResolvedValueOnce({
        delegation_id: 'del-fail-1',
        from_agent: 'thalos',
        to_agent: 'researcher',
        status: 'failed',
        error: 'Host unreachable: ENOTFOUND',
        provenance: {
          agent_id: 'researcher',
          model_used: 'none',
          tokens_used: 0,
          duration_ms: 100,
          tools_executed: [],
        },
      });

      const result = await executeTaskPlan(plan);

      expect(result.plan.status).toBe('partial');
      expect(result.plan.replan_count).toBe(1); // Increment re-plan counter
      expect(result.failedTasks[0]).toContain('Host unreachable');
      expect(result.summary).toContain('Failed / Incomplete Actions (Honest Report):');
    });
  });

  describe('S01-AC-06: Provider-Adapter Based Routing Without Pretense', () => {
    it('refuses to route tool calls to providers without native tool-calling capabilities', async () => {
      const { getAvailableProviders } = await import('../../src/intelligence/llmClient.js');
      const providers = await getAvailableProviders();

      const cloudflare = providers.find((p) => p.provider === 'cloudflare');
      expect(cloudflare).toBeDefined();
      expect(cloudflare?.toolCalling).toBe(false); // Does NOT pretend to support tool calling
    });
  });

  describe('S01-AC-07: Context Windows, Token Budgets, Timeouts & Max Steps', () => {
    it('enforces token budgets and truncates long conversation histories gracefully', async () => {
      const { assembleContext, estimateTokens } = await import('../../src/intelligence/contextAssembler.js');

      const longHistory = Array.from({ length: 30 }, (_, idx) => ({
        role: idx % 2 === 0 ? 'user' : 'assistant',
        content: `Historical business exchange message ${idx} with long details.`.repeat(10),
      }));

      const assembled = assembleContext({
        systemPrompt: 'You are THALOS.',
        userMessage: 'Give me current pipeline status.',
        history: longHistory,
        maxTokens: 500,
        maxHistoryTokens: 200,
      });

      expect(assembled.estimatedTokens).toBeLessThanOrEqual(500);
      expect(assembled.historyPrunedCount).toBeGreaterThan(0);
      expect(assembled.messages[0].role).toBe('system');
      expect(assembled.messages[assembled.messages.length - 1].content).toBe('Give me current pipeline status.');
    });
  });
});
