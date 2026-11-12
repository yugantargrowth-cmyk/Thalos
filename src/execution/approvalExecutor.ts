import { executeTool } from './toolDispatcher.js';
import { logger } from '../lib/logger.js';

interface ApprovalRecord {
  id: string;
  action: string;
  agent: string;
  payload: { tool_id: string; inputs: Record<string, unknown> };
}

export interface ExecutionResult {
  success: boolean;
  summary: string;
  evidence?: string;
  error?: string;
}

export async function executeApprovedAction(approval: ApprovalRecord): Promise<ExecutionResult> {
  const { tool_id, inputs } = approval.payload;

  if (!tool_id) {
    return { success: false, summary: 'Missing tool_id in approval payload', error: 'Invalid payload' };
  }

  try {
    const result = await executeTool({
      tool_id,
      agent_id: approval.agent,
      inputs,
      is_approved: true,
    });

    if (result.success) {
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
