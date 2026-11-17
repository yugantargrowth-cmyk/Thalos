import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowRuntime } from '../../src/execution/workflowRuntime.js';

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

const mockExecuteTool = vi.fn();
vi.mock('../../src/execution/toolDispatcher.js', () => ({
  executeTool: (...args: any[]) => mockExecuteTool(...args),
}));

describe('Workflow Runtime (L11-AC-07)', () => {
  let runtime: WorkflowRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new WorkflowRuntime();
  });

  it('executes a linear 2-step workflow to completion', async () => {
    const definition = {
      id: 'def-1',
      workflow_id: 'test_pipeline',
      display_name: 'Test Pipeline',
      description: 'A test pipeline',
      version: '1.0.0',
      status: 'active',
      steps: [
        { step: 'step_one', agent: 'scout', tool: 'web_search', depends_on: null },
        { step: 'step_two', agent: 'analyst', tool: 'generate_business_report', depends_on: 'step_one' },
      ],
    };

    const runRecord = {
      id: 'run-1',
      workflow_id: 'test_pipeline',
      run_number: 1,
      status: 'running',
      input_data: { query: 'test' },
      output_data: {},
      steps_completed: [],
      steps_failed: [],
    };

    // 1. Fetch definition
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: definition, error: null }),
        }),
      }),
    });

    // 2. Fetch latest run_number
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });

    // 3. Insert workflow_runs
    mockSupabase.from.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: runRecord, error: null }),
        }),
      }),
    });

    // Step 1 update current_step
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    });

    // Step 1 execution mock
    mockExecuteTool.mockResolvedValueOnce({
      success: true,
      output: { found: 5 },
      evidence: 'Searched web',
    });

    // Step 1 completed update
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    });

    // Step 2 update current_step
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    });

    // Step 2 execution mock
    mockExecuteTool.mockResolvedValueOnce({
      success: true,
      output: { report: 'Score: 90' },
      evidence: 'Generated report',
    });

    // Step 2 completed update
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    });

    // Workflow completed update
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    });

    const result = await runtime.executeWorkflow({
      workflowId: 'test_pipeline',
      inputData: { query: 'test' },
    });

    expect(result.status).toBe('completed');
    expect(result.stepsCompleted).toEqual(['step_one', 'step_two']);
    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
  });

  it('pauses workflow on human approval gate and creates approval record', async () => {
    const definition = {
      id: 'def-2',
      workflow_id: 'outreach_approval',
      display_name: 'Outreach with Gate',
      status: 'active',
      steps: [
        { step: 'draft', agent: 'hunter', tool: 'draft_email', depends_on: null },
        { step: 'approval_gate', type: 'human_approval', depends_on: 'draft' },
        { step: 'dispatch', agent: 'hunter', tool: 'send_email', depends_on: 'approval_gate' },
      ],
    };

    const runRecord = {
      id: 'run-2',
      workflow_id: 'outreach_approval',
      run_number: 1,
      status: 'running',
      input_data: {},
      output_data: {},
      steps_completed: [],
      steps_failed: [],
    };

    // 1. Fetch definition
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: definition, error: null }),
        }),
      }),
    });

    // 2. Latest run_number
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });

    // 3. Insert run
    mockSupabase.from.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: runRecord, error: null }),
        }),
      }),
    });

    // Step 1: draft
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });
    mockExecuteTool.mockResolvedValueOnce({ success: true, output: { draft: 'Hi' } });
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    // Step 2: approval_gate
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });
    // insert into approval_queue
    mockSupabase.from.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'appr-123' }, error: null }),
        }),
      }),
    });
    // update run status to awaiting_approval
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    const result = await runtime.executeWorkflow({
      workflowId: 'outreach_approval',
    });

    expect(result.status).toBe('awaiting_approval');
    expect(result.currentStep).toBe('approval_gate');
    expect(result.approvalId).toBe('appr-123');
    expect(result.stepsCompleted).toEqual(['draft']);
  });

  it('resumes workflow after approval and completes remaining steps', async () => {
    const runRecord = {
      id: 'run-2',
      workflow_id: 'outreach_approval',
      run_number: 1,
      status: 'awaiting_approval',
      current_step: 'approval_gate',
      steps_completed: ['draft'],
      steps_failed: [],
      output_data: {},
      input_data: {},
    };

    const definition = {
      workflow_id: 'outreach_approval',
      display_name: 'Outreach with Gate',
      status: 'active',
      steps: [
        { step: 'draft', agent: 'hunter', tool: 'draft_email', depends_on: null },
        { step: 'approval_gate', type: 'human_approval', depends_on: 'draft' },
        { step: 'dispatch', agent: 'hunter', tool: 'send_email', depends_on: 'approval_gate' },
      ],
    };

    // 1. Fetch run
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: runRecord, error: null }),
        }),
      }),
    });

    // 2. Update run to running with approval_gate marked completed
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: { ...runRecord, status: 'running', steps_completed: ['draft', 'approval_gate'] },
              error: null,
            }),
          }),
        }),
      }),
    });

    // 3. Fetch definition
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: definition, error: null }),
        }),
      }),
    });

    // Step 3: dispatch
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });
    mockExecuteTool.mockResolvedValueOnce({ success: true, output: { sent: true } });
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    // Workflow completion update
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    const result = await runtime.resumeWorkflow('run-2', true, 'owner');

    expect(result.status).toBe('completed');
    expect(result.stepsCompleted).toEqual(['draft', 'approval_gate', 'dispatch']);
  });

  it('marks workflow as rejected when resumeWorkflow is called with approved=false', async () => {
    const runRecord = {
      id: 'run-3',
      workflow_id: 'outreach_approval',
      run_number: 1,
      status: 'awaiting_approval',
      current_step: 'approval_gate',
      steps_completed: ['draft'],
      steps_failed: [],
    };

    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: runRecord, error: null }),
        }),
      }),
    });

    mockSupabase.from.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { ...runRecord, status: 'rejected' }, error: null }),
          }),
        }),
      }),
    });

    const result = await runtime.resumeWorkflow('run-3', false, 'owner');

    expect(result.status).toBe('rejected');
    expect(result.error).toContain('Rejected by owner');
  });

  it('halts execution and marks workflow failed if a tool step fails', async () => {
    const definition = {
      workflow_id: 'faulty_pipeline',
      display_name: 'Faulty Pipeline',
      status: 'active',
      steps: [
        { step: 'failing_step', agent: 'scout', tool: 'web_search', depends_on: null },
        { step: 'unreachable_step', agent: 'analyst', tool: 'generate_business_report', depends_on: 'failing_step' },
      ],
    };

    const runRecord = {
      id: 'run-fail',
      workflow_id: 'faulty_pipeline',
      run_number: 1,
      status: 'running',
      input_data: {},
      output_data: {},
      steps_completed: [],
      steps_failed: [],
    };

    mockSupabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: definition, error: null }) }) }),
    });
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
    });
    mockSupabase.from.mockReturnValueOnce({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: runRecord, error: null }) }) }),
    });

    // Step 1 fails
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });
    mockExecuteTool.mockResolvedValueOnce({ success: false, error: 'Network timeout' });
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    const result = await runtime.executeWorkflow({ workflowId: 'faulty_pipeline' });

    expect(result.status).toBe('failed');
    expect(result.stepsFailed).toEqual(['failing_step']);
    expect(result.stepsCompleted).toEqual([]);
    expect(result.error).toContain('Network timeout');
  });

  it('returns existing run if idempotencyKey is matched', async () => {
    const existingRun = {
      id: 'run-existing',
      workflow_id: 'test_pipeline',
      run_number: 5,
      status: 'completed',
      steps_completed: ['step_one', 'step_two'],
      steps_failed: [],
      output_data: { done: true },
    };

    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: existingRun, error: null }),
        }),
      }),
    });

    const result = await runtime.executeWorkflow({
      workflowId: 'test_pipeline',
      idempotencyKey: 'idemp-xyz-123',
    });

    expect(result.runId).toBe('run-existing');
    expect(result.status).toBe('completed');
    expect(result.runNumber).toBe(5);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });
});
