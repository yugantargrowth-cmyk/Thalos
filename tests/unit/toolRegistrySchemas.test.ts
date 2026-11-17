import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TOOL_PARAMS } from '../../src/intelligence/toolRegistry.js';
import { HANDLERS, executeTool } from '../../src/execution/toolDispatcher.js';

// Mock Supabase
const mockSupabase = {
  from: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

describe('Tool Registry and Dispatcher Schemas (L11-AC-01, L11-AC-02, L11-AC-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ALL_TOOL_IDS = [
    'web_search',
    'website_audit',
    'social_lookup',
    'create_lead',
    'update_lead',
    'log_lead_activity',
    'schedule_follow_up',
    'draft_whatsapp',
    'draft_email',
    'send_whatsapp',
    'send_email',
    'create_client',
    'create_project',
    'create_task',
    'update_project',
    'update_task',
    'build_proposal',
    'build_invoice',
    'generate_business_report',
    'export_business_data',
    'sheets_import',
    'search_knowledge',
    'ingest_knowledge_file',
    'save_to_db',
  ];

  it('every registered tool has a parameter schema in TOOL_PARAMS (L11-AC-01, L11-AC-02)', () => {
    for (const toolId of ALL_TOOL_IDS) {
      const spec = TOOL_PARAMS[toolId];
      expect(spec, `Missing TOOL_PARAMS for ${toolId}`).toBeDefined();
      expect(spec.type).toBe('object');
      expect(spec.properties).toBeDefined();
    }
  });

  it('every registered tool has an executable handler in HANDLERS (L11-AC-01)', () => {
    for (const toolId of ALL_TOOL_IDS) {
      const handler = HANDLERS[toolId];
      expect(handler, `Missing handler for ${toolId}`).toBeDefined();
      expect(typeof handler).toBe('function');
    }
  });

  it('rejects execution if tool does not exist', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'Not found' } }),
        }),
      }),
    });

    const result = await executeTool({
      tool_id: 'non_existent_tool',
      agent_id: 'scout',
      inputs: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool not found: non_existent_tool');
  });

  it('rejects execution if tool status is disabled (L11-AC-01)', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { tool_id: 'web_search', status: 'disabled', unavailable_reason: 'Search API disabled' },
            error: null,
          }),
        }),
      }),
    });

    const result = await executeTool({
      tool_id: 'web_search',
      agent_id: 'scout',
      inputs: { query: 'test' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Search API disabled');
  });

  it('rejects execution if required integration is not operational (L11-AC-03)', async () => {
    // 1. Tool fetch
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { tool_id: 'web_search', status: 'available', integration_id: 'tavily' },
            error: null,
          }),
        }),
      }),
    });

    // 2. Integration fetch
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { status: 'not_configured', display_name: 'Tavily Search' },
            error: null,
          }),
        }),
      }),
    });

    const result = await executeTool({
      tool_id: 'web_search',
      agent_id: 'scout',
      inputs: { query: 'test' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("requires integration 'tavily' which is not ready (status: not_configured)");
  });

  it('rejects execution if agent is not permitted to use tool (L11-AC-03)', async () => {
    // 1. Tool fetch
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { tool_id: 'create_lead', status: 'available' },
            error: null,
          }),
        }),
      }),
    });

    // 2. Agent fetch
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { agent_id: 'spark', allowed_tools: ['web_search', 'draft_email'] },
            error: null,
          }),
        }),
      }),
    });

    const result = await executeTool({
      tool_id: 'create_lead',
      agent_id: 'spark',
      inputs: { name: 'Acme Corp' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Agent spark is not permitted to use tool: create_lead');
  });

  it('validates schema inputs and rejects missing required parameters (L11-AC-02)', async () => {
    // 1. Tool fetch
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { tool_id: 'save_to_db', status: 'available' },
            error: null,
          }),
        }),
      }),
    });

    // 2. Agent fetch
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { agent_id: 'scout', allowed_tools: ['save_to_db'] },
            error: null,
          }),
        }),
      }),
    });

    // save_to_db requires 'table' and 'record'
    const result = await executeTool({
      tool_id: 'save_to_db',
      agent_id: 'scout',
      inputs: { table: 'leads' }, // missing 'record'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required parameter for save_to_db: record');
  });
});
