/**
 * Mission S04: Hands - Tool Contracts, Handlers & Gateway Verification Tests
 * S04-AC-01 through S04-AC-08
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAllToolContracts,
  getToolContract,
  validateToolInput,
  loadToolSpecs,
} from '../../src/intelligence/toolRegistry.js';
import { HANDLERS, executeTool } from '../../src/execution/toolDispatcher.js';

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

describe('Tool Contracts & Schema Completeness (S04-AC-01, S04-AC-02)', () => {
  const ALL_TOOL_IDS = [
    'web_search',
    'website_audit',
    'social_lookup',
    'draft_whatsapp',
    'draft_email',
    'send_whatsapp',
    'send_email',
    'create_lead',
    'update_lead',
    'log_lead_activity',
    'schedule_follow_up',
    'create_task',
    'update_task',
    'create_project',
    'update_project',
    'create_client',
    'build_proposal',
    'build_invoice',
    'generate_business_report',
    'export_business_data',
    'sheets_import',
    'save_to_db',
    'search_knowledge',
    'ingest_knowledge_file',
    'n8n_trigger',
  ];

  it('every tool has a complete contract definition (S04-AC-01)', () => {
    const contracts = getAllToolContracts();
    expect(contracts.length).toBe(25);

    for (const toolId of ALL_TOOL_IDS) {
      const contract = getToolContract(toolId);
      expect(contract, `Contract missing for ${toolId}`).toBeDefined();
      expect(contract?.tool_id).toBe(toolId);
      expect(contract?.display_name).toBeTruthy();
      expect(contract?.description).toBeTruthy();
      expect(contract?.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(contract?.timeout_seconds).toBeGreaterThan(0);
      expect(typeof contract?.permission_level).toBe('number');
      expect(contract?.input_schema).toBeDefined();
      expect(contract?.input_schema.type).toBe('object');
      expect(contract?.output_schema).toBeDefined();
      expect(contract?.output_schema.type).toBe('object');
      expect(contract?.evidence_contract.success).toBeTruthy();
      expect(contract?.evidence_contract.failure).toBeTruthy();
    }
  });

  it('every enabled tool maps to exactly one real handler or declared adapter (S04-AC-02)', () => {
    for (const toolId of ALL_TOOL_IDS) {
      const handler = HANDLERS[toolId];
      expect(handler, `Handler missing for ${toolId}`).toBeDefined();
      expect(typeof handler).toBe('function');
    }
  });

  it('validates tool inputs against contract schema', () => {
    // Missing required field
    const resMissing = validateToolInput('create_lead', { name: 'Acme Corp' }); // missing phone
    expect(resMissing.valid).toBe(false);
    expect(resMissing.errors.some((e) => e.includes('Missing required parameter for create_lead: phone'))).toBe(true);

    // Invalid data type
    const resType = validateToolInput('create_task', { title: 12345 }); // title must be string
    expect(resType.valid).toBe(false);
    expect(resType.errors.some((e) => e.includes("Parameter 'title' must be a string"))).toBe(true);

    // Invalid enum value
    const resEnum = validateToolInput('create_task', { title: 'Valid Title', priority: 'ultra_critical' });
    expect(resEnum.valid).toBe(false);
    expect(resEnum.errors.some((e) => e.includes("Parameter 'priority' has invalid value"))).toBe(true);

    // Valid inputs
    const resValid = validateToolInput('create_task', { title: 'Deploy v2', priority: 'high' });
    expect(resValid.valid).toBe(true);
    expect(resValid.errors).toHaveLength(0);
  });
});

describe('Tool Visibility & Exclusions (S04-AC-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes disabled and unconfigured tools from loadToolSpecs', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: {
                  agent_id: 'scout',
                  allowed_tools: ['web_search', 'n8n_trigger', 'disabled_tool'],
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'tools') {
        return {
          select: () => ({
            in: (_col: string, _ids: string[]) => ({
              in: (_statusCol: string, allowedStatuses: string[]) => {
                // Verify that 'needs_configuration' and 'disabled' are NOT allowed
                expect(allowedStatuses).not.toContain('needs_configuration');
                expect(allowedStatuses).not.toContain('disabled');
                // Only return tools that match the allowed statuses
                return Promise.resolve({
                  data: [
                    { tool_id: 'web_search', display_name: 'Web Search', description: 'Search', status: 'available' },
                  ],
                  error: null,
                });
              },
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const specs = await loadToolSpecs('scout');
    expect(specs).toHaveLength(1);
    expect(specs[0].function.name).toBe('web_search');
    expect(specs.some((s) => s.function.name === 'n8n_trigger')).toBe(false);
  });
});

describe('Server-side Authorization, Idempotency & Normalization (S04-AC-04, S04-AC-05, S04-AC-06, S04-AC-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unprivileged user roles from executing sensitive permission_level >= 2 tools (S04-AC-04)', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: {
              tool_id: 'send_email',
              status: 'available',
              permission_level: 2,
              requires_approval: true,
            },
            error: null,
          }),
        }),
      }),
    });

    const result = await executeTool({
      tool_id: 'send_email',
      agent_id: 'hunter',
      inputs: { to: 'client@example.com', subject: 'Hello', html: '<p>Hi</p>' },
      user_role: 'guest',
      correlation_id: 'corr-unauth-test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("User role 'guest' is not authorized");
    expect(result.tool_id).toBe('send_email');
    expect(result.correlation_id).toBe('corr-unauth-test');
    expect(result.timestamp).toBeDefined();
  });

  it('re-uses completed execution on duplicate idempotent request (S04-AC-06)', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: {
              tool_id: 'save_to_db',
              status: 'available',
              permission_level: 0,
              idempotent: true,
            },
            error: null,
          }),
        }),
      }),
    });

    // Agent lookup
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { allowed_tools: ['save_to_db'], prohibited_actions: [] },
            error: null,
          }),
        }),
      }),
    });

    // Idempotency lookup in tool_executions: finds existing completed run
    const existingRun = {
      id: 'exec-existing-42',
      output: { persisted: true, record_id: 'rec-123' },
      evidence: 'Record saved to database',
      status: 'completed',
    };

    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: existingRun, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await executeTool({
      tool_id: 'save_to_db',
      agent_id: 'scout',
      inputs: { table: 'leads', record: { name: 'Acme Dental' } },
      idempotency_key: 'idemp-save-42',
      correlation_id: 'corr-idemp-1',
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ persisted: true, record_id: 'rec-123' });
    expect(result.evidence).toContain('[Idempotent replay]');
    expect(result.correlation_id).toBe('corr-idemp-1');
  });

  it('returns explicit failure and never converts exceptions into success (S04-AC-07)', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: {
              tool_id: 'web_search',
              status: 'available',
              permission_level: 0,
              requires_approval: false,
            },
            error: null,
          }),
        }),
      }),
    });

    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { allowed_tools: ['web_search'], prohibited_actions: [] },
            error: null,
          }),
        }),
      }),
    });

    // Insert tool_executions
    mockSupabase.from.mockReturnValueOnce({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'exec-fail-1' } }) }) }),
    });

    // Update tool_executions to failed
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    });

    // We pass an empty query to web_search which will throw Error('Search query is required')
    const result = await executeTool({
      tool_id: 'web_search',
      agent_id: 'scout',
      inputs: { query: '   ' }, // blank query
      correlation_id: 'corr-fail-explicit',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.correlation_id).toBe('corr-fail-explicit');
    expect(result.tool_id).toBe('web_search');
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });
});
