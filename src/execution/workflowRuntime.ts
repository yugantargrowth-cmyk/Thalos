import crypto from 'crypto';
import { getSupabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';
import { executeTool } from './toolDispatcher.js';

export interface WorkflowStep {
  step: string;
  type?: 'tool' | 'human_approval' | string;
  agent?: string;
  tool?: string;
  tools?: string[];
  depends_on?: string | string[] | null;
  requires_approval?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  workflow_id: string;
  display_name: string;
  description: string;
  version: string;
  status: string;
  trigger_type: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  steps: WorkflowStep[];
  max_steps?: number;
  timeout_seconds?: number;
  approval_required?: boolean;
}

export interface WorkflowRunRecord {
  id: string;
  workflow_id: string;
  run_number: number | string;
  status: string;
  trigger_type?: string;
  triggered_by?: string;
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  current_step?: string | null;
  steps_completed?: string[];
  steps_failed?: string[];
  error_message?: string | null;
  idempotency_key?: string | null;
  approval_id?: string | null;
  started_at?: string;
  completed_at?: string | null;
}

export interface ExecuteWorkflowParams {
  workflowId: string;
  inputData?: Record<string, unknown>;
  triggerType?: 'manual' | 'scheduled' | 'event';
  triggeredBy?: string;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface WorkflowRunResult {
  runId: string;
  workflowId: string;
  runNumber: number;
  status: string;
  currentStep?: string | null;
  stepsCompleted: string[];
  stepsFailed: string[];
  outputData?: Record<string, unknown>;
  approvalId?: string | null;
  error?: string;
}

export class WorkflowRuntime {
  /**
   * Start executing a versioned workflow definition.
   */
  async executeWorkflow(params: ExecuteWorkflowParams): Promise<WorkflowRunResult> {
    const supabase = getSupabase();
    const { workflowId, inputData = {}, triggerType = 'manual', triggeredBy = 'system', idempotencyKey, correlationId } = params;

    // Check idempotency key if provided
    if (idempotencyKey) {
      const { data: existingRun } = await supabase
        .from('workflow_runs')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingRun) {
        logger.info('Returning existing workflow run for idempotency key', { idempotencyKey, runId: existingRun.id });
        return {
          runId: existingRun.id,
          workflowId: existingRun.workflow_id,
          runNumber: Number(existingRun.run_number),
          status: existingRun.status,
          currentStep: existingRun.current_step,
          stepsCompleted: existingRun.steps_completed ?? [],
          stepsFailed: existingRun.steps_failed ?? [],
          outputData: existingRun.output_data ?? {},
          approvalId: existingRun.approval_id,
          error: existingRun.error_message,
        };
      }
    }

    // Load workflow definition
    const { data: definition, error: defErr } = await supabase
      .from('workflow_definitions')
      .select('*')
      .eq('workflow_id', workflowId)
      .single();

    if (defErr || !definition) {
      throw new Error(`Workflow definition not found: ${workflowId}`);
    }

    if (definition.status !== 'active') {
      throw new Error(`Workflow '${workflowId}' is not active (status: ${definition.status})`);
    }

    // Determine next run_number
    const { data: latestRun } = await supabase
      .from('workflow_runs')
      .select('run_number')
      .eq('workflow_id', workflowId)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const runNumber = (latestRun?.run_number ? Number(latestRun.run_number) : 0) + 1;

    // Create workflow_run row
    const { data: run, error: createErr } = await supabase
      .from('workflow_runs')
      .insert({
        workflow_id: workflowId,
        run_number: runNumber,
        status: 'running',
        trigger_type: triggerType,
        triggered_by: triggeredBy,
        input_data: inputData,
        output_data: {},
        steps_completed: [],
        steps_failed: [],
        idempotency_key: idempotencyKey ?? null,
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (createErr || !run) {
      throw new Error(`Failed to create workflow run: ${createErr?.message ?? 'Unknown error'}`);
    }

    await audit({
      event_type: 'workflow.started',
      entity_type: 'workflow_run',
      entity_id: run.id,
      actor: triggeredBy,
      description: `Workflow run #${runNumber} started for ${definition.display_name}`,
      metadata: { workflow_id: workflowId, run_number: runNumber, correlation_id: correlationId },
    });

    return this.runStepLoop(run, definition, correlationId);
  }

  /**
   * Resume an awaiting_approval workflow run after human approval or rejection.
   */
  async resumeWorkflow(runId: string, approved: boolean, approver = 'owner', correlationId?: string): Promise<WorkflowRunResult> {
    const supabase = getSupabase();

    const { data: run, error: fetchErr } = await supabase
      .from('workflow_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (fetchErr || !run) {
      throw new Error(`Workflow run not found: ${runId}`);
    }

    if (run.status !== 'awaiting_approval') {
      throw new Error(`Workflow run is not awaiting approval (current status: ${run.status})`);
    }

    if (!approved) {
      await supabase
        .from('workflow_runs')
        .update({
          status: 'rejected',
          error_message: `Rejected by ${approver}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);

      await audit({
        event_type: 'workflow.rejected',
        entity_type: 'workflow_run',
        entity_id: runId,
        actor: approver,
        description: `Workflow run #${run.run_number} rejected by ${approver}`,
        metadata: { workflow_id: run.workflow_id, correlation_id: correlationId },
      });

      return {
        runId,
        workflowId: run.workflow_id,
        runNumber: Number(run.run_number),
        status: 'rejected',
        currentStep: run.current_step,
        stepsCompleted: run.steps_completed ?? [],
        stepsFailed: run.steps_failed ?? [],
        outputData: run.output_data ?? {},
        error: `Rejected by ${approver}`,
      };
    }

    // Approved: mark the awaiting step completed if it was an approval gate
    const stepsCompleted: string[] = [...(run.steps_completed ?? [])];
    if (run.current_step && !stepsCompleted.includes(run.current_step)) {
      stepsCompleted.push(run.current_step);
    }

    const { data: updatedRun } = await supabase
      .from('workflow_runs')
      .update({
        status: 'running',
        approval_id: null,
        steps_completed: stepsCompleted,
        current_step: null,
      })
      .eq('id', runId)
      .select('*')
      .single();

    const { data: definition } = await supabase
      .from('workflow_definitions')
      .select('*')
      .eq('workflow_id', run.workflow_id)
      .single();

    if (!definition) {
      throw new Error(`Workflow definition not found: ${run.workflow_id}`);
    }

    return this.runStepLoop(updatedRun ?? run, definition, correlationId);
  }

  /**
   * Internal step execution loop resolving dependencies.
   */
  private async runStepLoop(
    run: WorkflowRunRecord,
    definition: WorkflowDefinition,
    correlationId?: string
  ): Promise<WorkflowRunResult> {
    const supabase = getSupabase();
    const steps: WorkflowStep[] = Array.isArray(definition.steps) ? (definition.steps as WorkflowStep[]) : [];
    const stepsCompleted: string[] = Array.isArray(run.steps_completed) ? [...run.steps_completed] : [];
    const stepsFailed: string[] = Array.isArray(run.steps_failed) ? [...run.steps_failed] : [];
    const outputData: Record<string, unknown> = { ...(run.output_data ?? {}) };
    const maxSteps = definition.max_steps ?? 50;
    let iteration = 0;

    while (iteration < maxSteps) {
      iteration++;

      // Check if all steps completed
      const remainingSteps = steps.filter(s => !stepsCompleted.includes(s.step));
      if (remainingSteps.length === 0) {
        // Complete!
        await supabase
          .from('workflow_runs')
          .update({
            status: 'completed',
            current_step: null,
            steps_completed: stepsCompleted,
            output_data: outputData,
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id);

        await audit({
          event_type: 'workflow.completed',
          entity_type: 'workflow_run',
          entity_id: run.id,
          actor: 'system',
          description: `Workflow run #${run.run_number} completed successfully`,
          metadata: { workflow_id: definition.workflow_id, correlation_id: correlationId },
        });

        return {
          runId: run.id,
          workflowId: definition.workflow_id,
          runNumber: Number(run.run_number),
          status: 'completed',
          stepsCompleted,
          stepsFailed,
          outputData,
        };
      }

      // Find ready step(s) whose depends_on are satisfied
      const readyStep = remainingSteps.find(s => {
        if (!s.depends_on) return true;
        if (Array.isArray(s.depends_on)) {
          return s.depends_on.every(dep => stepsCompleted.includes(dep));
        }
        return stepsCompleted.includes(s.depends_on);
      });

      if (!readyStep) {
        // Deadlock / dependency cycle or blocked on a failed step
        const failedDep = remainingSteps.some(s => {
          if (!s.depends_on) return false;
          if (Array.isArray(s.depends_on)) {
            return s.depends_on.some(dep => stepsFailed.includes(dep));
          }
          return stepsFailed.includes(s.depends_on);
        });

        const errorMsg = failedDep
          ? 'Workflow stalled due to dependency failure'
          : 'Workflow stalled due to unresolvable step dependencies or cycle';

        await supabase
          .from('workflow_runs')
          .update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id);

        return {
          runId: run.id,
          workflowId: definition.workflow_id,
          runNumber: Number(run.run_number),
          status: 'failed',
          stepsCompleted,
          stepsFailed,
          outputData,
          error: errorMsg,
        };
      }

      // Mark current step
      await supabase
        .from('workflow_runs')
        .update({ current_step: readyStep.step })
        .eq('id', run.id);

      // Check if step requires human approval
      const isApprovalGate = readyStep.type === 'human_approval' || readyStep.requires_approval === true;
      if (isApprovalGate && !stepsCompleted.includes(readyStep.step)) {
        const payloadStr = JSON.stringify({
          workflow_run_id: run.id,
          step: readyStep.step,
          workflow_id: definition.workflow_id,
          inputs: run.input_data,
        });
        const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');

        const { data: approval } = await supabase
          .from('approval_queue')
          .insert({
            action: `Workflow step '${readyStep.step}' in ${definition.display_name}`,
            agent: readyStep.agent ?? 'system',
            target_name: readyStep.step,
            payload: {
              workflow_run_id: run.id,
              step: readyStep.step,
              inputs: run.input_data,
            },
            payload_hash: payloadHash,
            workflow_run_id: run.id,
          })
          .select('id')
          .single();

        await supabase
          .from('workflow_runs')
          .update({
            status: 'awaiting_approval',
            approval_id: approval?.id ?? null,
            current_step: readyStep.step,
          })
          .eq('id', run.id);

        await audit({
          event_type: 'workflow.awaiting_approval',
          entity_type: 'workflow_run',
          entity_id: run.id,
          actor: 'system',
          description: `Workflow run #${run.run_number} paused for approval on step '${readyStep.step}'`,
          metadata: { approval_id: approval?.id, correlation_id: correlationId },
        });

        return {
          runId: run.id,
          workflowId: definition.workflow_id,
          runNumber: Number(run.run_number),
          status: 'awaiting_approval',
          currentStep: readyStep.step,
          approvalId: approval?.id ?? null,
          stepsCompleted,
          stepsFailed,
          outputData,
        };
      }

      // Execute tool(s) for the step
      const toolNames: string[] = readyStep.tools ?? (readyStep.tool ? [readyStep.tool] : []);
      let stepSuccess = true;
      let stepError = '';

      for (const toolId of toolNames) {
        // Merge inputs from run input_data + prior step output
        const stepInputs: Record<string, unknown> = {
          ...(run.input_data ?? {}),
          ...(readyStep.depends_on && typeof readyStep.depends_on === 'string'
            ? (outputData[readyStep.depends_on] as Record<string, unknown> ?? {})
            : {}),
        };

        const result = await executeTool({
          tool_id: toolId,
          agent_id: readyStep.agent ?? 'system',
          inputs: stepInputs,
          workflow_run_id: run.id,
          correlation_id: correlationId,
        });

        if (result.queued_for_approval) {
          // Tool itself queued an approval
          await supabase
            .from('workflow_runs')
            .update({
              status: 'awaiting_approval',
              approval_id: result.approval_id ?? null,
              current_step: readyStep.step,
            })
            .eq('id', run.id);

          return {
            runId: run.id,
            workflowId: definition.workflow_id,
            runNumber: Number(run.run_number),
            status: 'awaiting_approval',
            currentStep: readyStep.step,
            approvalId: result.approval_id ?? null,
            stepsCompleted,
            stepsFailed,
            outputData,
          };
        }

        if (!result.success) {
          stepSuccess = false;
          stepError = result.error ?? `Tool ${toolId} failed`;
          break;
        }

        outputData[`${readyStep.step}:${toolId}`] = result.output;
      }

      if (!stepSuccess) {
        stepsFailed.push(readyStep.step);
        await supabase
          .from('workflow_runs')
          .update({
            status: 'failed',
            steps_failed: stepsFailed,
            error_message: stepError,
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id);

        await audit({
          event_type: 'workflow.failed',
          entity_type: 'workflow_run',
          entity_id: run.id,
          actor: 'system',
          description: `Workflow run #${run.run_number} failed at step '${readyStep.step}': ${stepError}`,
          metadata: { step: readyStep.step, error: stepError, correlation_id: correlationId },
        });

        return {
          runId: run.id,
          workflowId: definition.workflow_id,
          runNumber: Number(run.run_number),
          status: 'failed',
          currentStep: readyStep.step,
          stepsCompleted,
          stepsFailed,
          outputData,
          error: stepError,
        };
      }

      // Step succeeded
      stepsCompleted.push(readyStep.step);
      outputData[readyStep.step] = { completed: true, timestamp: new Date().toISOString() };

      await supabase
        .from('workflow_runs')
        .update({
          steps_completed: stepsCompleted,
          output_data: outputData,
        })
        .eq('id', run.id);
    }

    // Exceeded max_steps
    const maxStepErr = `Workflow exceeded maximum step iteration limit (${maxSteps})`;
    await supabase
      .from('workflow_runs')
      .update({
        status: 'failed',
        error_message: maxStepErr,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    return {
      runId: run.id,
      workflowId: definition.workflow_id,
      runNumber: Number(run.run_number),
      status: 'failed',
      stepsCompleted,
      stepsFailed,
      outputData,
      error: maxStepErr,
    };
  }
}

export const workflowRuntime = new WorkflowRuntime();
export const executeWorkflow = (params: ExecuteWorkflowParams) => workflowRuntime.executeWorkflow(params);
export const resumeWorkflow = (runId: string, approved: boolean, approver?: string, correlationId?: string) =>
  workflowRuntime.resumeWorkflow(runId, approved, approver, correlationId);
