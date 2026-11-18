/**
 * Mission S06: Nervous System - Workflow Engine, DAG, Conditions & Resumption Tests
 * S06-AC-05, S06-AC-06, S06-AC-07
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkflowRuntime,
  validateWorkflowDefinition,
  evaluateCondition,
} from '../../src/execution/workflowRuntime.js';

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

describe('Workflow Validation and DAG Cycle Detection (S06-AC-05)', () => {
  it('validates valid workflow definitions', () => {
    const validDef = {
      workflow_id: 'order_processing',
      display_name: 'Order Processing',
      description: 'Processes incoming orders',
      version: '1.0.0',
      status: 'active',
      steps: [
        { step: 'validate_order', tool: 'verify_data' },
        { step: 'charge_card', tool: 'process_payment', depends_on: 'validate_order' },
        { step: 'send_receipt', tool: 'send_email', depends_on: 'charge_card' },
      ],
    };

    const result = validateWorkflowDefinition(validDef);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects circular dependencies (cycles) in DAG', () => {
    const cyclicDef = {
      workflow_id: 'cyclic_flow',
      display_name: 'Cyclic Flow',
      description: 'Contains a cycle',
      version: '1.0.0',
      status: 'active',
      steps: [
        { step: 'step_a', tool: 'tool_a', depends_on: 'step_c' },
        { step: 'step_b', tool: 'tool_b', depends_on: 'step_a' },
        { step: 'step_c', tool: 'tool_c', depends_on: 'step_b' },
      ],
    };

    const result = validateWorkflowDefinition(cyclicDef);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Circular dependency cycle detected'))).toBe(true);
  });

  it('rejects self-referencing steps and unknown dependencies', () => {
    const selfDepDef = {
      workflow_id: 'bad_deps',
      display_name: 'Bad Deps',
      description: 'Invalid deps',
      version: '1.0.0',
      status: 'active',
      steps: [
        { step: 'step_1', tool: 'tool_1', depends_on: 'step_1' },
        { step: 'step_2', tool: 'tool_2', depends_on: 'non_existent_step' },
      ],
    };

    const result = validateWorkflowDefinition(selfDepDef);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Step 'step_1' cannot depend on itself");
    expect(result.errors).toContain("Step 'step_2' references unknown dependency 'non_existent_step'");
  });

  it('rejects duplicate step names and empty steps array', () => {
    const dupDef = {
      workflow_id: 'dup_flow',
      display_name: 'Duplicate Flow',
      description: 'Has duplicate step name',
      version: '1.0.0',
      status: 'active',
      steps: [
        { step: 'init', tool: 'tool_a' },
        { step: 'init', tool: 'tool_b' },
      ],
    };

    const result = validateWorkflowDefinition(dupDef);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Duplicate step name: 'init'");
  });
});

describe('Workflow Step Conditions (S06-AC-06)', () => {
  const context = {
    inputs: { amount: 500, customer_type: 'vip', dry_run: false },
    outputs: {
      check_inventory: { in_stock: true, items: 3 },
    },
  };

  it('evaluates string comparison conditions accurately', () => {
    expect(evaluateCondition('inputs.amount > 100', context)).toBe(true);
    expect(evaluateCondition('inputs.amount > 1000', context)).toBe(false);
    expect(evaluateCondition("inputs.customer_type === 'vip'", context)).toBe(true);
    expect(evaluateCondition("inputs.customer_type !== 'regular'", context)).toBe(true);
    expect(evaluateCondition('outputs.check_inventory.in_stock === true', context)).toBe(true);
  });

  it('evaluates truthy/falsy and inverted conditions', () => {
    expect(evaluateCondition('inputs.dry_run', context)).toBe(false);
    expect(evaluateCondition('!inputs.dry_run', context)).toBe(true);
    expect(evaluateCondition('outputs.check_inventory.in_stock', context)).toBe(true);
  });

  it('evaluates custom predicate functions', () => {
    expect(evaluateCondition((ctx) => (ctx.inputs.amount as number) >= 500, context)).toBe(true);
    expect(evaluateCondition((ctx) => (ctx.inputs.amount as number) < 100, context)).toBe(false);
  });
});

describe('Step Execution, Conditions, Timeouts & Failure Branches (S06-AC-06)', () => {
  let runtime: WorkflowRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new WorkflowRuntime();
  });

  it('skips a step cleanly when its condition evaluates to false and continues workflow', async () => {
    const definition = {
      id: 'def-cond',
      workflow_id: 'conditional_pipeline',
      display_name: 'Conditional Pipeline',
      description: 'Tests step condition skipping',
      version: '1.0.0',
      status: 'active',
      steps: [
        { step: 'step_always', tool: 'tool_a', depends_on: null },
        { step: 'step_skip', tool: 'tool_b', depends_on: 'step_always', condition: 'inputs.run_special === true' },
        { step: 'step_final', tool: 'tool_c', depends_on: 'step_always' },
      ],
    };

    const runRecord = {
      id: 'run-cond-1',
      workflow_id: 'conditional_pipeline',
      run_number: 1,
      status: 'running',
      input_data: { run_special: false },
      output_data: {},
      steps_completed: [],
      steps_failed: [],
    };

    // 1. Definition lookup
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: definition, error: null }) }) }),
    });
    // 2. Run number
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
    });
    // 3. Insert run
    mockSupabase.from.mockReturnValueOnce({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: runRecord, error: null }) }) }),
    });

    // Step Always
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });
    mockExecuteTool.mockResolvedValueOnce({ success: true, output: { step_a: 'ok' } });
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    // Step Skip (condition false -> update steps_completed with skipped status)
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    // Step Final
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });
    mockExecuteTool.mockResolvedValueOnce({ success: true, output: { step_c: 'done' } });
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    // Workflow completion update
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    const result = await runtime.executeWorkflow({
      workflowId: 'conditional_pipeline',
      inputData: { run_special: false },
    });

    expect(result.status).toBe('completed');
    expect(result.stepsCompleted).toContain('step_always');
    expect(result.stepsCompleted).toContain('step_skip');
    expect(result.stepsCompleted).toContain('step_final');
    expect(result.outputData?.step_skip).toEqual(expect.objectContaining({ skipped: true }));
    expect(mockExecuteTool).toHaveBeenCalledTimes(2); // Only step_always and step_final ran
  });

  it('supports on_failure: continue so subsequent independent steps execute', async () => {
    const definition = {
      id: 'def-fail-cont',
      workflow_id: 'fail_continue_pipeline',
      display_name: 'Fail Continue Pipeline',
      description: 'Non-critical step failure does not abort entire flow',
      version: '1.0.0',
      status: 'active',
      steps: [
        { step: 'optional_sync', tool: 'sync_tool', depends_on: null, on_failure: 'continue' },
        { step: 'core_operation', tool: 'core_tool', depends_on: null },
      ],
    };

    const runRecord = {
      id: 'run-fc-1',
      workflow_id: 'fail_continue_pipeline',
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
      select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
    });
    mockSupabase.from.mockReturnValueOnce({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: runRecord, error: null }) }) }),
    });

    // Step 1 optional_sync fails
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });
    mockExecuteTool.mockResolvedValueOnce({ success: false, error: 'External service 500' });
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    // Step 2 core_operation succeeds
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });
    mockExecuteTool.mockResolvedValueOnce({ success: true, output: { processed: true } });
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    // Completion update
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    const result = await runtime.executeWorkflow({ workflowId: 'fail_continue_pipeline' });
    expect(result.status).toBe('completed');
    expect(result.stepsFailed).toContain('optional_sync');
    expect(result.stepsCompleted).toContain('core_operation');
    expect(result.outputData?.optional_sync).toEqual(expect.objectContaining({ failed: true }));
  });
});

describe('Checkpointing, Resumption & Idempotency (S06-AC-07)', () => {
  let runtime: WorkflowRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new WorkflowRuntime();
  });

  it('resumes an interrupted workflow without re-executing already completed steps', async () => {
    const definition = {
      id: 'def-res',
      workflow_id: 'three_stage_pipeline',
      display_name: 'Three Stage Pipeline',
      description: 'Resumes cleanly',
      version: '1.0.0',
      status: 'active',
      steps: [
        { step: 'stage_1', tool: 'tool_1', depends_on: null },
        { step: 'stage_2', tool: 'tool_2', depends_on: 'stage_1' },
        { step: 'stage_3', tool: 'tool_3', depends_on: 'stage_2' },
      ],
    };

    // Simulated run that was interrupted after stage_1 completed
    const interruptedRun = {
      id: 'run-interrupted-777',
      workflow_id: 'three_stage_pipeline',
      run_number: 1,
      status: 'running',
      input_data: { batch_id: 'batch-001' },
      output_data: { stage_1: { done: true, stage_1_res: 42 } },
      steps_completed: ['stage_1'], // Stage 1 already finished!
      steps_failed: [],
    };

    // 1. Fetch run record
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: interruptedRun, error: null }) }) }),
    });

    // 2. Fetch definition
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: definition, error: null }) }) }),
    });

    // Step 2 (stage_2) execution
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });
    mockExecuteTool.mockResolvedValueOnce({ success: true, output: { stage_2_res: 'valid' } });
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    // Step 3 (stage_3) execution
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });
    mockExecuteTool.mockResolvedValueOnce({ success: true, output: { stage_3_res: 'complete' } });
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    // Completion update
    mockSupabase.from.mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve() }) });

    const result = await runtime.resumeInterruptedRun('run-interrupted-777');

    expect(result.status).toBe('completed');
    expect(result.stepsCompleted).toEqual(['stage_1', 'stage_2', 'stage_3']);
    // Stage 1 was NOT called again! Only stage 2 and stage 3 were executed
    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
    expect(mockExecuteTool).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tool_id: 'tool_2' })
    );
    expect(mockExecuteTool).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tool_id: 'tool_3' })
    );
  });
});
