import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentService, CANONICAL_AGENTS, AgentService } from '../../src/intelligence/agentService.js';

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

const mockLlmCall = vi.fn();
vi.mock('../../src/intelligence/llmClient.js', () => ({
  llmCall: (...args: any[]) => mockLlmCall(...args),
}));

const mockExecuteTool = vi.fn();
vi.mock('../../src/execution/toolDispatcher.js', () => ({
  executeTool: (...args: any[]) => mockExecuteTool(...args),
}));

vi.mock('../../src/intelligence/toolRegistry.js', () => ({
  loadToolSpecs: vi.fn().mockResolvedValue([
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Web search',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    },
  ]),
  TOOL_PARAMS: {
    web_search: {},
    website_audit: {},
    create_lead: {},
  },
}));

describe('Agent Service & Delegation Contracts (L10-AC-01 through L10-AC-08)', () => {
  let service: AgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentService();
  });

  it('recognizes exactly the 9 approved canonical agents (L10-AC-01)', () => {
    expect(CANONICAL_AGENTS.length).toBe(9);
    expect(CANONICAL_AGENTS).toEqual([
      'thalos',
      'scout',
      'hunter',
      'closer',
      'operator',
      'spark',
      'publisher',
      'analyst',
      'researcher',
    ]);

    for (const id of CANONICAL_AGENTS) {
      expect(service.isCanonicalAgent(id)).toBe(true);
    }
    expect(service.isCanonicalAgent('rogue_agent')).toBe(false);
  });

  it('asserts THALOS is the only founder-facing orchestrator (L10-AC-04)', () => {
    expect(() => service.assertFounderFacingOrchestrator('thalos')).not.toThrow();
    expect(() => service.assertFounderFacingOrchestrator('scout')).toThrow(
      /Specialist agent 'scout' cannot bypass orchestrator/
    );
    expect(() => service.assertFounderFacingOrchestrator('closer')).toThrow();
  });

  it('validates agent updates and rejects non-canonical agents (L10-AC-02, L10-AC-03)', async () => {
    await expect(
      service.updateAgent('unknown_agent', { display_name: 'Test' })
    ).rejects.toThrow('Cannot modify non-canonical agent');

    // Invalid tool
    await expect(
      service.updateAgent('scout', { allowed_tools: ['invalid_tool_xyz'] })
    ).rejects.toThrow();

    // Valid update
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { agent_id: 'scout', display_name: 'Scout Old' },
            error: null,
          }),
        }),
      }),
    });

    mockSupabase.from.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: { agent_id: 'scout', display_name: 'Scout Pro', model_capability: 'quality' },
              error: null,
            }),
          }),
        }),
      }),
    });

    const updated = await service.updateAgent('scout', {
      display_name: 'Scout Pro',
      model_capability: 'quality',
    });

    expect(updated.display_name).toBe('Scout Pro');
    expect(updated.model_capability).toBe('quality');
  });

  it('enforces delegation recursion and cycle guards (L10-AC-06)', async () => {
    // 1. Max depth check
    const depthRes = await service.delegateTask({
      from_agent: 'closer',
      to_agent: 'analyst',
      task_type: 'deep_calc',
      input: {},
      delegation_stack: ['thalos', 'scout', 'closer'], // length 3 >= MAX_DELEGATION_DEPTH
    });

    expect(depthRes.status).toBe('failed');
    expect(depthRes.error).toContain('Maximum delegation depth (3) exceeded');

    // 2. Cyclic delegation check
    const cycleRes = await service.delegateTask({
      from_agent: 'hunter',
      to_agent: 'scout',
      task_type: 'find_more',
      input: {},
      delegation_stack: ['thalos', 'scout'], // scout is already in stack
    });

    expect(cycleRes.status).toBe('failed');
    expect(cycleRes.error).toContain('Cyclic delegation detected');

    // 3. Upward delegation to orchestrator check
    const upwardRes = await service.delegateTask({
      from_agent: 'operator',
      to_agent: 'thalos',
      task_type: 'orchestrate',
      input: {},
    });

    expect(upwardRes.status).toBe('failed');
    expect(upwardRes.error).toContain('cannot delegate upward to orchestrator');
  });

  it('executes bounded task delegation with tool restrictions and provenance (L10-AC-05, L10-AC-07, L10-AC-08)', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: {
              agent_id: 'scout',
              status: 'active',
              system_instructions: 'You are Scout.',
              allowed_tools: ['web_search'],
              model_capability: 'fast',
              timeout_seconds: 30,
              max_steps: 5,
            },
            error: null,
          }),
        }),
      }),
    });

    // Step 1: LLM outputs tool call
    mockLlmCall.mockResolvedValueOnce({
      content: '',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      tokens_used: 40,
      tool_calls: [
        {
          id: 'scout_tc_1',
          type: 'function',
          function: { name: 'web_search', arguments: JSON.stringify({ query: 'Dentists Ahmedabad' }) },
        },
      ],
    });

    mockExecuteTool.mockResolvedValueOnce({
      success: true,
      output: { found: 10 },
      evidence: 'Searched web',
    });

    // Step 2: Final response
    mockLlmCall.mockResolvedValueOnce({
      content: JSON.stringify({ summary: 'Found 10 dentist leads' }),
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      tokens_used: 50,
      tool_calls: [],
    });

    const result = await service.delegateTask({
      from_agent: 'thalos',
      to_agent: 'scout',
      task_type: 'discover_leads',
      input: { industry: 'dentists', city: 'Ahmedabad' },
      correlation_id: 'test-trace-del-1',
    });

    expect(result.status).toBe('completed');
    expect(result.from_agent).toBe('thalos');
    expect(result.to_agent).toBe('scout');
    expect(result.provenance).toBeDefined();
    expect(result.provenance.agent_id).toBe('scout');
    expect(result.provenance.tools_executed).toEqual(['web_search']);
    expect(result.provenance.tokens_used).toBe(90);
    expect(typeof result.provenance.duration_ms).toBe('number');
  });

  it('rejects forbidden tool calls within delegation loop (L10-AC-08)', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: {
              agent_id: 'scout',
              status: 'active',
              system_instructions: 'You are Scout.',
              allowed_tools: ['web_search'], // create_client NOT allowed
              model_capability: 'fast',
              timeout_seconds: 30,
              max_steps: 5,
            },
            error: null,
          }),
        }),
      }),
    });

    // Scout tries to invoke forbidden create_client
    mockLlmCall.mockResolvedValueOnce({
      content: '',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      tokens_used: 30,
      tool_calls: [
        {
          id: 'tc_forbidden',
          type: 'function',
          function: { name: 'create_client', arguments: JSON.stringify({ business_name: 'Hack' }) },
        },
      ],
    });

    // LLM receives error feedback and finishes
    mockLlmCall.mockResolvedValueOnce({
      content: JSON.stringify({ error: 'Permission denied to create client' }),
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      tokens_used: 20,
      tool_calls: [],
    });

    const result = await service.delegateTask({
      from_agent: 'thalos',
      to_agent: 'scout',
      task_type: 'illegal_task',
      input: {},
    });

    // executeTool was never called because permission was denied
    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
  });
});
