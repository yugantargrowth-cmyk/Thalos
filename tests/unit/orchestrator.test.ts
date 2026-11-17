import { describe, it, expect, vi, beforeEach } from 'vitest';
import { thalosOrchestrate, classifyIntent, selectAgent } from '../../src/intelligence/orchestrator.js';

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

const mockLoadToolSpecs = vi.fn();
vi.mock('../../src/intelligence/toolRegistry.js', () => ({
  loadToolSpecs: (...args: any[]) => mockLoadToolSpecs(...args),
  TOOL_PARAMS: {},
}));

describe('THALOS Orchestrator & Loop Guard (L09-AC-05, L09-AC-06, R-006)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies intents and selects specialist agents correctly', async () => {
    mockLlmCall.mockResolvedValueOnce({
      content: 'lead_discovery',
      model: 'test',
      provider: 'groq',
      tokens_used: 5,
    });

    const intent = await classifyIntent('Find me 10 dental clinics in Ahmedabad', []);
    expect(intent).toBe('lead_discovery');
    expect(selectAgent('lead_discovery')).toBe('scout');
    expect(selectAgent('outreach')).toBe('hunter');
    expect(selectAgent('deal_progression')).toBe('closer');
    expect(selectAgent('client_ops')).toBe('operator');
    expect(selectAgent('reporting')).toBe('analyst');
    expect(selectAgent('unknown')).toBe('thalos');
  });

  it('executes tool calling loop and returns synthesized response', async () => {
    // 1. Mock DB queries for business context and agent definition
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: {
                  system_instructions: 'You are Scout.',
                  allowed_tools: ['web_search'],
                  model_capability: 'fast',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      // Business context tables (leads, clients, approval_queue, follow_ups)
      return {
        select: () => ({
          neq: () => ({ neq: () => ({ neq: () => Promise.resolve({ data: [] }) }) }),
          eq: () => ({ lte: () => Promise.resolve({ data: [] }) }),
        }),
      };
    });

    mockLoadToolSpecs.mockResolvedValueOnce([
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search web',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      },
    ]);

    // Intent classification mock
    mockLlmCall.mockResolvedValueOnce({ content: 'lead_discovery', tokens_used: 10, model: 'groq', provider: 'groq' });

    // Step 1: LLM outputs tool call
    mockLlmCall.mockResolvedValueOnce({
      content: 'Searching for leads...',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      tokens_used: 40,
      tool_calls: [
        {
          id: 'call_search_1',
          type: 'function',
          function: { name: 'web_search', arguments: JSON.stringify({ query: 'Dental clinics Ahmedabad' }) },
        },
      ],
    });

    // Tool execution mock
    mockExecuteTool.mockResolvedValueOnce({
      success: true,
      output: { results: ['Clinic A', 'Clinic B'] },
      evidence: '2 results found',
    });

    // Step 2: LLM synthesizes outcome
    mockLlmCall.mockResolvedValueOnce({
      content: 'Found 2 dental clinics in Ahmedabad: Clinic A and Clinic B.',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      tokens_used: 60,
      tool_calls: [], // Turn finished
    });

    const result = await thalosOrchestrate({
      message: 'Find dental clinics in Ahmedabad',
      history: [],
      sessionDate: '2026-11-18',
    });

    expect(result.intent).toBe('lead_discovery');
    expect(result.agent_id).toBe('scout');
    expect(result.actions_taken).toEqual(['done:web_search']);
    expect(result.response).toContain('Clinic A and Clinic B');
  });

  it('triggers loop guard and terminates loop when repetitive identical tool calls occur (R-006)', async () => {
    mockSupabase.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { system_instructions: 'Agent prompt', allowed_tools: ['web_search'], model_capability: 'fast' },
            error: null,
          }),
        }),
        neq: () => ({ neq: () => ({ neq: () => Promise.resolve({ data: [] }) }) }),
      }),
    }));

    mockLoadToolSpecs.mockResolvedValueOnce([
      { type: 'function', function: { name: 'web_search', description: 'Search', parameters: {} } },
    ]);

    // Intent
    mockLlmCall.mockResolvedValueOnce({ content: 'lead_discovery', tokens_used: 5, model: 'groq', provider: 'groq' });

    const duplicateToolCall = {
      content: 'Searching...',
      provider: 'groq',
      model: 'llama',
      tokens_used: 20,
      tool_calls: [
        {
          id: 'repeat_call',
          type: 'function',
          function: { name: 'web_search', arguments: JSON.stringify({ query: 'same query' }) },
        },
      ],
    };

    // Return identical tool call 3 times consecutively
    mockLlmCall
      .mockResolvedValueOnce(duplicateToolCall) // call 1
      .mockResolvedValueOnce(duplicateToolCall) // call 2
      .mockResolvedValueOnce(duplicateToolCall); // call 3 (loop guard triggers & breaks)

    mockExecuteTool.mockResolvedValue({
      success: true,
      output: { found: 0 },
    });

    // Final synthesis call after loop break
    mockLlmCall.mockResolvedValueOnce({
      content: 'I noticed repeated identical searches with no new leads. Stopping search.',
      provider: 'groq',
      model: 'llama',
      tokens_used: 30,
    });

    const result = await thalosOrchestrate({
      message: 'Keep searching',
      history: [],
      sessionDate: '2026-11-18',
    });

    expect(result.loop_guard_triggered).toBe(true);
    expect(result.response).toContain('Stopping search');
  });

  it('retries tool execution once upon transient failure (R-006)', async () => {
    mockSupabase.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { system_instructions: 'Agent prompt', allowed_tools: ['web_search'], model_capability: 'fast' },
            error: null,
          }),
        }),
        neq: () => ({ neq: () => ({ neq: () => Promise.resolve({ data: [] }) }) }),
      }),
    }));

    mockLoadToolSpecs.mockResolvedValueOnce([
      { type: 'function', function: { name: 'web_search', description: 'Search', parameters: {} } },
    ]);

    mockLlmCall.mockResolvedValueOnce({ content: 'lead_discovery', tokens_used: 5, model: 'groq', provider: 'groq' });

    // Step 1: LLM calls web_search
    mockLlmCall.mockResolvedValueOnce({
      content: '',
      provider: 'groq',
      model: 'llama',
      tokens_used: 25,
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 'web_search', arguments: JSON.stringify({ query: 'tech startup' }) },
        },
      ],
    });

    // First attempt fails with transient timeout
    mockExecuteTool.mockResolvedValueOnce({
      success: false,
      error: 'HTTP 429 Rate limit exceeded; timeout',
    });

    // Retry attempt succeeds
    mockExecuteTool.mockResolvedValueOnce({
      success: true,
      output: { results: ['Startup 1'] },
      evidence: 'Retried successfully',
    });

    // Step 2: Synthesis
    mockLlmCall.mockResolvedValueOnce({
      content: 'Retried and found Startup 1.',
      provider: 'groq',
      model: 'llama',
      tokens_used: 35,
    });

    const result = await thalosOrchestrate({
      message: 'Find startups',
      history: [],
      sessionDate: '2026-11-18',
    });

    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
    expect(result.actions_taken).toEqual(['done:web_search']);
    expect(result.response).toContain('Startup 1');
  });

  it('records approvals in pending_approvals without executing sensitive tools', async () => {
    mockSupabase.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { system_instructions: 'Hunter prompt', allowed_tools: ['send_whatsapp'], model_capability: 'fast' },
            error: null,
          }),
        }),
        neq: () => ({ neq: () => ({ neq: () => Promise.resolve({ data: [] }) }) }),
      }),
    }));

    mockLoadToolSpecs.mockResolvedValueOnce([
      { type: 'function', function: { name: 'send_whatsapp', description: 'Send', parameters: {} } },
    ]);

    mockLlmCall.mockResolvedValueOnce({ content: 'outreach', tokens_used: 5, model: 'groq', provider: 'groq' });

    mockLlmCall.mockResolvedValueOnce({
      content: '',
      provider: 'groq',
      model: 'llama',
      tokens_used: 20,
      tool_calls: [
        {
          id: 'send_c1',
          type: 'function',
          function: { name: 'send_whatsapp', arguments: JSON.stringify({ phone: '+919999999999', content: 'Hello' }) },
        },
      ],
    });

    mockExecuteTool.mockResolvedValueOnce({
      success: true,
      queued_for_approval: true,
      approval_id: 'appr-whatsapp-999',
    });

    mockLlmCall.mockResolvedValueOnce({
      content: "I've queued the WhatsApp message for your approval.",
      provider: 'groq',
      model: 'llama',
      tokens_used: 20,
    });

    const result = await thalosOrchestrate({
      message: 'Send WhatsApp to Dr. Patel',
      history: [],
      sessionDate: '2026-11-18',
    });

    expect(result.actions_taken).toEqual(['queued:send_whatsapp']);
    expect(result.pending_approvals).toContain('appr-whatsapp-999');
    expect(result.response).toContain("queued the WhatsApp message for your approval");
  });
});
