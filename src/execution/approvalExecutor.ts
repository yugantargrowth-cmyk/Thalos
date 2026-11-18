import crypto from 'crypto';
import { executeTool } from './toolDispatcher.js';
import { resumeWorkflow } from './workflowRuntime.js';
import { logger } from '../lib/logger.js';

interface ApprovalRecord {
  id: string;
  action: string;
  agent: string;
  workflow_run_id?: string | null;
  payload_hash?: string;
  payload: {
    tool_id?: string;
    workflow_run_id?: string;
    step?: string;
    inputs?: Record<string, unknown>;
  };
}

export interface ExecutionResult {
  success: boolean;
  summary: string;
  evidence?: string;
  error?: string;
}

export async function executeApprovedAction(approval: ApprovalRecord): Promise<ExecutionResult> {
  const { tool_id, inputs = {} } = approval.payload;
  const workflowRunId = approval.workflow_run_id ?? approval.payload?.workflow_run_id;

  // Re-verify payload integrity before execution if payload_hash is present (S07-AC-04)
  if (approval.payload_hash) {
    const computedHash = crypto.createHash('sha256').update(JSON.stringify(approval.payload)).digest('hex');
    if (computedHash !== approval.payload_hash) {
      logger.error('Approval payload tampered before execution', {
        approval_id: approval.id,
        expected: approval.payload_hash,
        actual: computedHash,
      });
      return {
        success: false,
        summary: 'Approval execution aborted: payload has been tampered with',
        error: 'Integrity check failed',
      };
    }
  }

  // Case 1: Pure workflow approval gate (no tool_id)
  if (!tool_id && workflowRunId) {
    try {
      const runResult = await resumeWorkflow(workflowRunId, true, approval.agent);
      return {
        success: runResult.status !== 'failed',
        summary: `Workflow resumed (status: ${runResult.status})`,
        evidence: `Workflow run ${workflowRunId} resumed after approval`,
        error: runResult.error,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, summary: `Workflow resume failed: ${msg}`, error: msg };
    }
  }

  if (!tool_id) {
    return { success: false, summary: 'Missing tool_id in approval payload', error: 'Invalid payload' };
  }

  try {
    const result = await executeTool({
      tool_id,
      agent_id: approval.agent,
      inputs,
      is_approved: true,
      workflow_run_id: workflowRunId ?? undefined,
    });

    if (result.success) {
      // If part of a workflow run, resume subsequent steps
      if (workflowRunId) {
        try {
          await resumeWorkflow(workflowRunId, true, approval.agent);
        } catch (resErr) {
          logger.warn('Failed to auto-resume workflow after approved tool execution', { workflowRunId, err: resErr });
        }
      }

      return {
        success: true,
        summary: `${tool_id} completed successfully`,
        evidence: result.evidence,
      };
    } else {
      return {
        success: false,
        summary: `${tool_id} failed: ${result.error}`,
        error: result.error,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Approval execution error', { approval_id: approval.id, tool_id, error: msg });
    return { success: false, summary: `Execution failed: ${msg}`, error: msg };
  }
}
