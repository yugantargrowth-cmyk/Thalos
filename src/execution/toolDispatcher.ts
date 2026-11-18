/**
 * Tool Dispatcher
 * ─────────────────────────────────────────────────────────────
 * Receives a ToolCallRequest → checks permissions → routes to
 * the correct handler → returns verified result or failure.
 *
 * Key invariants:
 * - Tools with requires_approval=true NEVER execute; they create
 *   an approval_queue record and return 'queued_for_approval'.
 * - Execution evidence is ALWAYS captured — never assumed.
 * - Failures are reported, not hidden.
 */

import { getSupabase } from '../lib/supabase.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import crypto from 'crypto';

// Tool handlers
import * as webSearch from './tools/webSearch.js';
import * as websiteAudit from './tools/websiteAudit.js';
import * as socialLookup from './tools/socialLookup.js';
import * as saveToDB from './tools/saveToDb.js';
import * as searchKnowledge from './tools/searchKnowledge.js';
import * as draftCompose from './tools/draftCompose.js';
import * as sendEmail from './tools/sendEmail.js';
import * as sendWhatsapp from './tools/sendWhatsapp.js';
import * as crmTools from './tools/crmTools.js';
import * as financeTools from './tools/financeTools.js';
import * as reportingTools from './tools/reportingTools.js';

import { TOOL_PARAMS } from '../intelligence/toolRegistry.js';

export interface ToolCallRequest {
  tool_id: string;
  agent_id: string;
  inputs: Record<string, unknown>;
  workflow_run_id?: string;
  job_id?: string;
  is_approved?: boolean;
  correlation_id?: string;
}

export interface ToolResult {
  success: boolean;
  output?: unknown;
  evidence?: string;
  queued_for_approval?: boolean;
  approval_id?: string;
  error?: string;
  duration_ms: number;
}

type ToolHandler = (inputs: Record<string, unknown>) => Promise<{
  output: unknown;
  evidence?: string;
}>;

export const HANDLERS: Record<string, ToolHandler> = {
  // Research
  web_search: webSearch.execute,
  website_audit: websiteAudit.execute,
  social_lookup: socialLookup.execute,

  // Knowledge
  search_knowledge: searchKnowledge.execute,
  ingest_knowledge_file: reportingTools.executeIngestKnowledgeFile,

  // Communication — drafts
  draft_whatsapp: draftCompose.executeDraftWhatsApp,
  draft_email: draftCompose.executeDraftEmail,

  // Communication — sends (require_approval=true in DB)
  send_email: sendEmail.execute,
  send_whatsapp: sendWhatsapp.execute,

  // Finance (require_approval=true in DB)
  build_proposal: financeTools.executeBuildProposal,
  build_invoice: financeTools.executeBuildInvoice,

  // CRM — creates
  create_lead: crmTools.executeCreateLead,
  create_client: crmTools.executeCreateClient,
  create_task: crmTools.executeCreateTask,
  create_project: crmTools.executeCreateProject,

  // CRM — updates
  update_lead: crmTools.executeUpdateLead,
  update_task: crmTools.executeUpdateTask,
  update_project: crmTools.executeUpdateProject,

  // CRM — activities
  log_lead_activity: crmTools.executeLogLeadActivity,
  schedule_follow_up: crmTools.executeScheduleFollowUp,

  // Reporting & data
  generate_business_report: reportingTools.executeGenerateBusinessReport,
  export_business_data: reportingTools.executeExportBusinessData,
  sheets_import: reportingTools.executeSheetsImport,

  // Generic DB write (agent-facing)
  save_to_db: saveToDB.execute,
};

export async function executeTool(req: ToolCallRequest): Promise<ToolResult> {
  const start = Date.now();
  const supabase = getSupabase();

  // Load tool definition
  const { data: tool } = await supabase
    .from('tools')
    .select('*')
    .eq('tool_id', req.tool_id)
    .single();

  if (!tool) {
    return { success: false, error: `Tool not found: ${req.tool_id}`, duration_ms: Date.now() - start };
  }

  // Check availability
  if (tool.status !== 'available') {
    const reason = tool.unavailable_reason ?? `Tool status: ${tool.status}`;
    return { success: false, error: reason, duration_ms: Date.now() - start };
  }

  // Check integration readiness (L11-AC-03)
  if (tool.integration_id) {
    const { data: integ } = await supabase
      .from('integrations')
      .select('status, display_name')
      .eq('integration_id', tool.integration_id)
      .maybeSingle();

    const readyStatuses = ['configured', 'connected', 'tested', 'operational'];
    if (integ && !readyStatuses.includes(integ.status)) {
      return {
        success: false,
        error: `Tool ${req.tool_id} requires integration '${tool.integration_id}' which is not ready (status: ${integ.status})`,
        duration_ms: Date.now() - start,
      };
    }
  }

  // Check agent exists and is allowed to use this tool (S07-AC-03, Least Privilege)
  const { data: agent } = await supabase
    .from('agents')
    .select('allowed_tools, prohibited_actions')
    .eq('agent_id', req.agent_id)
    .single();

  if (!agent) {
    return {
      success: false,
      error: `Agent not found or unregistered: ${req.agent_id}`,
      duration_ms: Date.now() - start,
    };
  }

  if (Array.isArray(agent.prohibited_actions) && agent.prohibited_actions.includes(req.tool_id)) {
    return {
      success: false,
      error: `Action explicitly prohibited for agent ${req.agent_id}: ${req.tool_id}`,
      duration_ms: Date.now() - start,
    };
  }

  if (!Array.isArray(agent.allowed_tools) || !agent.allowed_tools.includes(req.tool_id)) {
    return {
      success: false,
      error: `Agent ${req.agent_id} is not permitted to use tool: ${req.tool_id}`,
      duration_ms: Date.now() - start,
    };
  }

  // Schema input validation (L11-AC-02)
  const specParams = TOOL_PARAMS[req.tool_id];
  if (specParams && Array.isArray(specParams.required)) {
    for (const requiredField of specParams.required) {
      const val = req.inputs[requiredField];
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        return {
          success: false,
          error: `Missing required parameter for ${req.tool_id}: ${requiredField}`,
          duration_ms: Date.now() - start,
        };
      }
    }
  }

  // Create execution record
  const inputsHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(req.inputs))
    .digest('hex');

  const { data: execRecord } = await supabase.from('tool_executions').insert({
    tool_id: req.tool_id,
    agent_id: req.agent_id,
    job_id: req.job_id ?? null,
    workflow_run_id: req.workflow_run_id ?? null,
    status: 'running',
    inputs_hash: inputsHash,
  }).select().single();

  const execId = execRecord?.id;

  // If tool requires approval, queue it and return (unless already approved)
  if (tool.requires_approval && !req.is_approved) {
    const payloadStr = JSON.stringify({ tool_id: req.tool_id, agent_id: req.agent_id, inputs: req.inputs });
    const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');

    const { data: approval } = await supabase.from('approval_queue').insert({
      action: `${tool.display_name} by ${req.agent_id}`,
      agent: req.agent_id,
      target_name: (req.inputs.target_name as string) ?? req.tool_id,
      payload: { tool_id: req.tool_id, inputs: req.inputs },
      payload_hash: payloadHash,
      workflow_run_id: req.workflow_run_id ?? null,
    }).select().single();

    if (execId) {
      await supabase.from('tool_executions').update({
        status: 'completed',
        output: { queued_for_approval: true, approval_id: approval?.id },
        evidence: `Queued for approval: ${approval?.id}`,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
      }).eq('id', execId);
    }

    return {
      success: true,
      queued_for_approval: true,
      approval_id: approval?.id,
      evidence: `Queued for approval: ${approval?.id}`,
      duration_ms: Date.now() - start,
    };
  }

  // Execute the tool
  const handler = HANDLERS[req.tool_id];
  if (!handler) {
    const err = `No handler implemented for tool: ${req.tool_id}`;
    if (execId) await supabase.from('tool_executions').update({ status: 'failed', error: err, completed_at: new Date().toISOString(), duration_ms: Date.now() - start }).eq('id', execId);
    return { success: false, error: err, duration_ms: Date.now() - start };
  }

  try {
    const { output, evidence } = await handler(req.inputs);
    const duration = Date.now() - start;

    if (execId) {
      await supabase.from('tool_executions').update({
        status: 'completed',
        output,
        evidence: evidence ?? 'Handler completed without specific evidence',
        verification_status: evidence ? 'verified' : 'unverified',
        completed_at: new Date().toISOString(),
        duration_ms: duration,
      }).eq('id', execId);
    }

    await audit({
      event_type: 'tool.executed',
      agent: req.agent_id,
      description: `${tool.display_name} completed (${duration}ms)`,
      metadata: { tool_id: req.tool_id, evidence, correlation_id: req.correlation_id },
    });

    return { success: true, output, evidence, duration_ms: duration };

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const duration = Date.now() - start;
    logger.error('Tool execution failed', { tool_id: req.tool_id, error: errMsg, correlation_id: req.correlation_id });

    if (execId) {
      await supabase.from('tool_executions').update({
        status: 'failed',
        error: errMsg,
        completed_at: new Date().toISOString(),
        duration_ms: duration,
      }).eq('id', execId);
    }

    await audit({
      event_type: 'tool.failed',
      agent: req.agent_id,
      description: `${tool.display_name} failed: ${errMsg}`,
      metadata: { tool_id: req.tool_id, error: errMsg, correlation_id: req.correlation_id },
    });

    return { success: false, error: errMsg, duration_ms: duration };
  }
}
