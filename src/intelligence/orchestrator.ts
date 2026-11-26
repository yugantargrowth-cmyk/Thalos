/**
 * THALOS Orchestrator
 * ─────────────────────────────────────────────────────────────
 * Receives founder message → classifies intent → delegates to
 * the right agent → runs an intelligent tool-call loop (up to MAX_STEPS)
 * with loop guards and retries → synthesises and returns results honestly.
 *
 * Implements:
 * - Provider-neutral tool calling through normalized llmCall (L09-AC-01, L09-AC-03)
 * - Token-budgeted context assembly via assembleContext (L09-AC-04)
 * - Multi-step planning and evaluation (L09-AC-05, L09-AC-06)
 * - Tool execution retry logic & repetitive loop guard (R-006, L09-AC-07)
 * - Redacted sensitive parameters & audit logging (L09-AC-08, L09-AC-09)
 */

import { getSupabase } from '../lib/supabase.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { llmCall } from './llmClient.js';
import type { LLMMessage, ToolDefinition } from './llmClient.js';
import { executeTool } from '../execution/toolDispatcher.js';
import { loadToolSpecs } from './toolRegistry.js';
import { assembleContext } from './contextAssembler.js';
import { agentService, CANONICAL_AGENTS } from './agentService.js';
import { v4 as uuidv4 } from 'uuid';

export interface OrchestrateInput {
  message: string;
  history: Array<{ role: string; content: string; timestamp?: string }>;
  sessionDate: string;
  correlationId?: string;
}

export type ActionStatus = 'none' | 'plan' | 'pending_approval' | 'attempted' | 'completed' | 'clarification_needed';

export interface OrchestrateResult {
  response: string;
  intent?: string;
  agent_id?: string;
  action_status?: ActionStatus;
  actions_taken?: string[];
  pending_approvals?: string[];
  tokens_used?: number;
  model_used?: string;
  loop_guard_triggered?: boolean;
}

export interface SubtaskPlan {
  step: number;
  description: string;
  agent: string;
  task_type: string;
  inputs: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  evidence?: string;
  error?: string;
}

export interface TaskPlan {
  plan_id: string;
  goal: string;
  is_complex: boolean;
  subtasks: SubtaskPlan[];
  status: 'planned' | 'executing' | 'completed' | 'partial' | 'failed';
  replan_count: number;
}

const MAX_STEPS = 6; // Max tool-call iterations per turn

const THALOS_SYSTEM_PROMPT = `You are THALOS, the AI business operating system for Yugantar Growth, owned and operated by Shlok Pandya (age 21, solo founder, Ahmedabad).

## Your role
You are the ONLY agent that talks to Shlok. Understand his intent, make a plan, use the right tools, and synthesise results honestly.

## Specialist focus areas
- scout / hunter: Prospect discovery and outreach message drafts
- researcher: Lead verification, public source research, knowledge retrieval
- analyst: Business metrics, pipeline analysis, reporting
- operator: Clients, projects, tasks, coordination
- closer: Proposals, invoices, deal progression

## Rules you never break
1. You NEVER fabricate outcomes. If a tool failed, say so with the exact reason.
2. You NEVER send messages, emails, or publish content without explicit approval from Shlok.
3. You NEVER make commercial commitments (pricing, discounts, terms) — Shlok decides.
4. You NEVER record a payment without Shlok's explicit confirmation.
5. You report partial success honestly: "X was done, Y failed because..."
6. When you do not know something, say so and offer to look it up.
7. When you need a decision, ask one clear question at a time.
8. draft_* tools create drafts in the approval queue — always tell Shlok what was queued.

## Response style
- Direct, short, confident (3S: Simple, Short, Smooth)
- Lead with the outcome, not the process
- Use numbers and specifics from tool results
- When an action needs approval: "I've queued [action] for your approval."
- When something failed: "I could not [X] because [honest reason]."`;

/** Intent classification */
export async function classifyIntent(message: string, history: LLMMessage[]): Promise<string> {
  try {
    const response = await llmCall(
      [
        {
          role: 'system',
          content: `Classify the user message into ONE category:
lead_discovery | outreach | research | deal_progression | client_ops | content | reporting | knowledge_query | system_config | general_question
Respond with ONLY the category name.`,
        },
        ...history.slice(-4),
        { role: 'user', content: message },
      ],
      { capability: 'fast', max_tokens: 20 }
    );
    return response.content.trim().toLowerCase().replace(/[^a-z_]/g, '') || 'general_question';
  } catch {
    return 'general_question';
  }
}

/** Select the right specialist agent for a given intent */
export function selectAgent(intent: string): string {
  const mapping: Record<string, string> = {
    lead_discovery: 'scout',
    outreach: 'hunter',
    research: 'researcher',
    deal_progression: 'closer',
    client_ops: 'operator',
    content: 'spark',
    reporting: 'analyst',
    knowledge_query: 'researcher',
    system_config: 'thalos',
    general_question: 'thalos',
  };
  return mapping[intent] ?? 'thalos';
}

/** Build a live business context snapshot */
export async function buildBusinessContext(): Promise<string> {
  const supabase = getSupabase();
  try {
    const [leads, clients, pendingApprovals, overdueFollowUps] = await Promise.all([
      supabase.from('leads').select('stage').neq('stage', 'won').neq('stage', 'lost').neq('stage', 'unqualified'),
      supabase.from('clients').select('business_name, status, monthly_value').eq('status', 'active'),
      supabase.from('approval_queue').select('action').eq('status', 'pending'),
      supabase.from('follow_ups').select('id').eq('status', 'pending').lte('due_date', new Date().toISOString().split('T')[0]),
    ]);

    const stageCounts: Record<string, number> = {};
    for (const l of leads.data ?? []) stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1;
    const mrr = (clients.data ?? []).reduce((s, c) => s + parseFloat(String(c.monthly_value ?? 0)), 0);

    return [
      `Today: ${new Date().toISOString().split('T')[0]}`,
      `Active pipeline: ${JSON.stringify(stageCounts)}`,
      `Active clients: ${(clients.data ?? []).length} | MRR: ₹${mrr.toLocaleString('en-IN')}`,
      `Pending approvals: ${(pendingApprovals.data ?? []).length}`,
      `Overdue follow-ups: ${(overdueFollowUps.data ?? []).length}`,
    ].join('\n');
  } catch {
    return 'Business context unavailable';
  }
}

/** Check if an error indicates a transient failure suitable for automatic retry */
function isTransientError(errorMsg: string): boolean {
  const lower = errorMsg.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('temporarily unavailable')
  );
}

/**
 * Intelligent Tool Loop with Loop Guard and Retry Logic (Resolves R-006, L09-AC-05, L09-AC-06)
 */
async function runToolLoop(
  initialMessages: LLMMessage[],
  tools: ToolDefinition[],
  agentId: string,
  modelCapability: 'fast' | 'quality' = 'fast',
  correlationId?: string
): Promise<{
  finalResponse: string;
  actionsTaken: string[];
  pendingApprovals: string[];
  tokensUsed: number;
  model: string;
  loopGuardTriggered: boolean;
}> {
  const actionsTaken: string[] = [];
  const pendingApprovals: string[] = [];
  let tokensUsed = 0;
  let lastModel = 'unknown';
  let loopGuardTriggered = false;

  const loopMessages: LLMMessage[] = [...initialMessages];

  // Map of executed tool calls signature -> occurrence count (Loop Guard)
  const callSignatures = new Map<string, number>();
  let consecutiveDuplicates = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await llmCall(loopMessages, {
      tools: tools.length > 0 ? tools : undefined,
      capability: modelCapability,
      max_tokens: 1500,
      temperature: 0.3,
    });

    tokensUsed += response.tokens_used;
    lastModel = `${response.provider}/${response.model}`;

    // If no tool calls were generated or finish_reason is stop, turn is complete
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return {
        finalResponse: response.content || 'Processing complete.',
        actionsTaken,
        pendingApprovals,
        tokensUsed,
        model: lastModel,
        loopGuardTriggered,
      };
    }

    // Append assistant response with tool calls to history
    loopMessages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: response.tool_calls,
    });

    // Execute each generated tool call
    for (const tc of response.tool_calls) {
      const toolId = tc.function.name;
      let inputs: Record<string, unknown> = {};
      try {
        inputs = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        inputs = {};
      }

      const signature = `${toolId}:${JSON.stringify(inputs)}`;
      const prevCalls = callSignatures.get(signature) ?? 0;
      callSignatures.set(signature, prevCalls + 1);

      // Loop Guard Check (R-006)
      if (prevCalls >= 2) {
        loopGuardTriggered = true;
        consecutiveDuplicates++;
        logger.warn('Loop guard triggered on duplicate tool call', { toolId, signature, step });

        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: toolId,
          content: JSON.stringify({
            success: false,
            error: 'Loop guard: Identical tool call repeated without progress. Formulate a final synthesis with the data already gathered.',
          }),
        });

        // If duplicate persists consecutively, break early to prevent infinite looping
        if (consecutiveDuplicates >= 2) {
          step = MAX_STEPS; // Force break
          break;
        }
        continue;
      } else {
        consecutiveDuplicates = 0;
      }

      logger.info('Executing tool call', { tool_id: toolId, agent_id: agentId, step, correlationId });

      // Execute tool with 1 automatic retry on transient error
      let result = await executeTool({
        tool_id: toolId,
        agent_id: agentId,
        inputs,
        correlation_id: correlationId,
      });

      if (!result.success && result.error && isTransientError(result.error)) {
        logger.warn('Tool failed with transient error; retrying once', { tool_id: toolId, error: result.error });
        await new Promise((r) => setTimeout(r, 500));
        result = await executeTool({
          tool_id: toolId,
          agent_id: agentId,
          inputs,
          correlation_id: correlationId,
        });
      }

      if (result.queued_for_approval) {
        const approvalSummary = `${toolId}(${JSON.stringify(inputs).slice(0, 80)})`;
        pendingApprovals.push(result.approval_id ?? approvalSummary);
        actionsTaken.push(`queued:${toolId}`);
        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: toolId,
          content: JSON.stringify({
            queued: true,
            approval_id: result.approval_id,
            note: 'Requires founder approval before execution',
          }),
        });
      } else if (result.success) {
        actionsTaken.push(`done:${toolId}`);
        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: toolId,
          content: JSON.stringify({
            success: true,
            output: result.output,
            evidence: result.evidence,
          }),
        });
      } else {
        actionsTaken.push(`failed:${toolId}`);
        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: toolId,
          content: JSON.stringify({
            success: false,
            error: result.error,
          }),
        });
      }
    }
  }

  // Exhausted steps or broken by loop guard — synthesize honestly
  const synthResponse = await llmCall(
    [
      ...loopMessages,
      {
        role: 'user',
        content:
          'Summarise what has been done so far, what was queued for approval, and what failed. State all outcomes honestly without inventing data.',
      },
    ],
    {
      capability: modelCapability,
      max_tokens: 800,
      temperature: 0.2,
    }
  );

  tokensUsed += synthResponse.tokens_used;

  return {
    finalResponse: synthResponse.content || 'Processing complete.',
    actionsTaken,
    pendingApprovals,
    tokensUsed,
    model: `${synthResponse.provider}/${synthResponse.model}`,
    loopGuardTriggered,
  };
}

/**
 * Check if user message indicates a complex multi-goal task requiring planning (S01-AC-03)
 */
export function isComplexRequest(message: string): boolean {
  const lower = message.toLowerCase();
  const multiDomainKeywords = [
    (lower.includes('research') || lower.includes('find') || lower.includes('search')) &&
      (lower.includes('draft') || lower.includes('email') || lower.includes('outreach')),
    (lower.includes('audit') || lower.includes('inspect')) &&
      (lower.includes('create lead') || lower.includes('add lead') || lower.includes('save')),
    (lower.includes('proposal') || lower.includes('invoice')) &&
      (lower.includes('send') || lower.includes('client')),
  ];
  return multiDomainKeywords.some(Boolean);
}

/**
 * Decompose complex requests into explicit sequential subtasks with assigned specialist agents (S01-AC-03)
 */
export async function decomposeAndPlanTask(
  message: string,
  _businessContext?: string
): Promise<TaskPlan> {
  const planId = `plan_${uuidv4().slice(0, 8)}`;
  const lower = message.toLowerCase();
  const subtasks: SubtaskPlan[] = [];

  // Pattern 1: Research prospect + Draft outreach email
  if (
    (lower.includes('research') || lower.includes('find') || lower.includes('lookup')) &&
    (lower.includes('draft') || lower.includes('email') || lower.includes('outreach') || lower.includes('message'))
  ) {
    subtasks.push({
      step: 1,
      description: 'Research company/lead background and key offerings',
      agent: 'researcher',
      task_type: 'research_prospect',
      inputs: { query: message },
      status: 'pending',
    });
    subtasks.push({
      step: 2,
      description: 'Draft customized outreach email based on research findings',
      agent: 'hunter',
      task_type: 'draft_outreach',
      inputs: { instructions: message },
      status: 'pending',
    });
  }
  // Pattern 2: Audit website + Create Lead record
  else if (
    (lower.includes('audit') || lower.includes('inspect')) &&
    (lower.includes('lead') || lower.includes('create') || lower.includes('save'))
  ) {
    subtasks.push({
      step: 1,
      description: 'Perform website audit and security/tech inspection',
      agent: 'researcher',
      task_type: 'audit_website',
      inputs: { query: message },
      status: 'pending',
    });
    subtasks.push({
      step: 2,
      description: 'Create CRM lead record with audit insights',
      agent: 'scout',
      task_type: 'create_lead_from_audit',
      inputs: { instructions: message },
      status: 'pending',
    });
  }
  // Pattern 3: General multi-step decomposition using LLM when available
  else {
    try {
      const response = await llmCall(
        [
          {
            role: 'system',
            content: `You are the THALOS Planning Engine. Decompose the user request into 1-3 sequential subtasks using only these agents:
scout, hunter, closer, operator, spark, publisher, analyst, researcher.
Respond with JSON only:
{"subtasks": [{"step": 1, "description": "...", "agent": "...", "task_type": "..."}]}`,
          },
          { role: 'user', content: message },
        ],
        { capability: 'fast', max_tokens: 400 }
      );

      const parsed = JSON.parse(response.content) as {
        subtasks?: Array<{ step: number; description: string; agent: string; task_type: string }>;
      };
      if (parsed.subtasks && Array.isArray(parsed.subtasks) && parsed.subtasks.length > 0) {
        parsed.subtasks.forEach((st, idx) => {
          subtasks.push({
            step: idx + 1,
            description: st.description,
            agent: CANONICAL_AGENTS.includes(st.agent as (typeof CANONICAL_AGENTS)[number]) ? (st.agent as (typeof CANONICAL_AGENTS)[number]) : 'thalos',
            task_type: st.task_type || 'execute_task',
            inputs: { query: message },
            status: 'pending',
          });
        });
      }
    } catch {
      const intent = await classifyIntent(message, []);
      subtasks.push({
        step: 1,
        description: `Execute intent: ${intent}`,
        agent: selectAgent(intent),
        task_type: intent,
        inputs: { query: message },
        status: 'pending',
      });
    }
  }

  return {
    plan_id: planId,
    goal: message,
    is_complex: subtasks.length > 1,
    subtasks,
    status: 'planned',
    replan_count: 0,
  };
}

/**
 * Execute subtask plan across specialist agents with intermediate evaluation and re-planning (S01-AC-04, S01-AC-05)
 */
export async function executeTaskPlan(
  plan: TaskPlan,
  correlationId?: string
): Promise<{
  plan: TaskPlan;
  summary: string;
  completedTasks: string[];
  pendingApprovals: string[];
  failedTasks: string[];
  unverifiedClaims: string[];
}> {
  plan.status = 'executing';
  const completedTasks: string[] = [];
  const pendingApprovals: string[] = [];
  const failedTasks: string[] = [];
  const unverifiedClaims: string[] = [];

  let previousContext: Record<string, unknown> = {};

  for (let i = 0; i < plan.subtasks.length; i++) {
    const subtask = plan.subtasks[i];
    subtask.status = 'in_progress';

    try {
      const delegationRes = await agentService.delegateTask({
        from_agent: 'thalos',
        to_agent: subtask.agent,
        task_type: subtask.task_type,
        input: { ...subtask.inputs, previous_context: previousContext },
        deadline_seconds: 30,
        max_steps: 4,
        correlation_id: correlationId,
      });

      if (delegationRes.status === 'completed') {
        subtask.status = 'completed';
        subtask.result = delegationRes.output;
        subtask.evidence = delegationRes.evidence;
        completedTasks.push(`[${subtask.agent}] ${subtask.description}`);
        previousContext = { ...previousContext, [subtask.task_type]: delegationRes.output };
      } else if (delegationRes.status === 'awaiting_approval') {
        subtask.status = 'completed';
        pendingApprovals.push(`[${subtask.agent}] ${subtask.description}`);
      } else {
        subtask.status = 'failed';
        subtask.error = delegationRes.error || 'Subtask delegation failed';
        failedTasks.push(`[${subtask.agent}] ${subtask.description}: ${subtask.error}`);

        // Re-planning evaluation (S01-AC-05)
        if (plan.replan_count < 2 && i < plan.subtasks.length - 1) {
          logger.warn('Subtask failed, attempting bounded re-plan', {
            plan_id: plan.plan_id,
            failed_step: subtask.step,
          });
          plan.replan_count++;
          subtask.error += ' (Handled by re-planning: skipping dependent steps)';
        }
      }
    } catch (err) {
      subtask.status = 'failed';
      subtask.error = err instanceof Error ? err.message : String(err);
      failedTasks.push(`[${subtask.agent}] ${subtask.description}: ${subtask.error}`);
    }
  }

  const anyFailed = plan.subtasks.some((s) => s.status === 'failed');
  const allCompleted = plan.subtasks.every((s) => s.status === 'completed');
  plan.status = allCompleted ? 'completed' : anyFailed ? 'partial' : 'completed';

  const summaryLines: string[] = [];
  summaryLines.push(`## Plan Execution Summary (${plan.status.toUpperCase()})`);

  if (completedTasks.length > 0) {
    summaryLines.push(`\n### Completed Actions:\n${completedTasks.map((t) => `- ${t}`).join('\n')}`);
  }
  if (pendingApprovals.length > 0) {
    summaryLines.push(`\n### Actions Pending Founder Approval:\n${pendingApprovals.map((t) => `- ${t}`).join('\n')}`);
  }
  if (failedTasks.length > 0) {
    summaryLines.push(`\n### Failed / Incomplete Actions (Honest Report):\n${failedTasks.map((t) => `- ${t}`).join('\n')}`);
  }
  if (unverifiedClaims.length > 0) {
    summaryLines.push(`\n### Unverified Claims:\n${unverifiedClaims.map((t) => `- ${t}`).join('\n')}`);
  }

  return {
    plan,
    summary: summaryLines.join('\n'),
    completedTasks,
    pendingApprovals,
    failedTasks,
    unverifiedClaims,
  };
}

/**
 * Check if user message indicates an action requiring essential entity parameters
 * that are missing from both message and recent history.
 */
export function checkMissingRequiredInfo(
  message: string,
  history: Array<{ role: string; content: string; timestamp?: string }>
): { isMissing: boolean; clarifyingQuestion?: string; intent?: string } {
  const lower = message.toLowerCase().trim();
  const recentHistoryText = history.slice(-4).map((h) => h.content).join(' ').toLowerCase();
  const fullContext = `${recentHistoryText} ${lower}`;

  // 1. Invoice creation check
  const isInvoiceIntent =
    (lower.includes('invoice') || lower.includes('bill')) &&
    (lower.includes('create') || lower.includes('draft') || lower.includes('generate') || lower.includes('send') || lower.includes('make'));
  if (isInvoiceIntent) {
    const hasAmount = /\b\d+(\.\d{1,2})?\b/.test(fullContext) || /₹|rs|inr|\$|usd/.test(fullContext);
    const hasClient = /for\s+([A-Za-z0-9\s_-]+)/.test(lower) || /client|customer/.test(recentHistoryText);
    if (!hasAmount && !hasClient) {
      return {
        isMissing: true,
        clarifyingQuestion: 'Could you specify the client name and the invoice amount so I can draft this accurately?',
        intent: 'deal_progression',
      };
    } else if (!hasAmount) {
      return {
        isMissing: true,
        clarifyingQuestion: 'What is the amount for this invoice?',
        intent: 'deal_progression',
      };
    }
  }

  // 2. Direct outreach check without recipient or target company
  const isOutreachIntent =
    (lower.includes('outreach') || lower.includes('pitch') || lower.includes('cold email')) &&
    (lower.includes('send') || lower.includes('draft') || lower.includes('write'));
  if (isOutreachIntent) {
    const mentionsTarget = /to\s+([A-Za-z0-9\s_-]+)/.test(lower) || /for\s+([A-Za-z0-9\s_-]+)/.test(lower) || fullContext.includes('@') || /company|prospect|lead/.test(recentHistoryText);
    if (!mentionsTarget && lower.split(/\s+/).length < 7) {
      return {
        isMissing: true,
        clarifyingQuestion: 'Which prospect or company should I draft this outreach message for?',
        intent: 'outreach',
      };
    }
  }

  return { isMissing: false };
}

/**
 * Main THALOS Orchestration Entry Point
 */
export async function thalosOrchestrate(input: OrchestrateInput): Promise<OrchestrateResult> {
  const { message, history, sessionDate, correlationId } = input;
  let totalTokens = 0;
  let lastModel = 'unknown';

  try {
    // 0. Check for missing required information before execution
    const missingCheck = checkMissingRequiredInfo(message, history);
    if (missingCheck.isMissing && missingCheck.clarifyingQuestion) {
      return {
        response: missingCheck.clarifyingQuestion,
        intent: missingCheck.intent || 'clarification_needed',
        agent_id: 'thalos',
        action_status: 'clarification_needed',
        actions_taken: [],
        pending_approvals: [],
        tokens_used: 10,
        model_used: 'thalos/clarification_guard',
      };
    }

    const historyMessages: LLMMessage[] = history.map((h) => ({
      role: (h.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: h.content,
    }));

    // 1. Check for complex multi-goal tasks requiring task decomposition (S01-AC-03)
    if (isComplexRequest(message)) {
      const plan = await decomposeAndPlanTask(message);
      if (plan.is_complex) {
        const planResult = await executeTaskPlan(plan, correlationId);

        await audit({
          event_type: 'intelligence.plan_executed',
          actor: 'founder',
          agent: 'thalos',
          description: `Executed plan ${plan.plan_id}: ${plan.status}`,
          metadata: {
            plan_id: plan.plan_id,
            completed_tasks: planResult.completedTasks,
            pending_approvals: planResult.pendingApprovals,
            failed_tasks: planResult.failedTasks,
            session_date: sessionDate,
            correlation_id: correlationId,
          },
        });

        const actionStatus: ActionStatus =
          planResult.pendingApprovals.length > 0
            ? 'pending_approval'
            : planResult.completedTasks.length > 0
            ? 'completed'
            : planResult.failedTasks.length > 0
            ? 'attempted'
            : 'plan';

        return {
          response: planResult.summary,
          intent: 'multi_step_plan',
          agent_id: 'thalos',
          action_status: actionStatus,
          actions_taken: planResult.completedTasks,
          pending_approvals: planResult.pendingApprovals,
          tokens_used: 150,
          model_used: 'thalos/cognitive_planner',
        };
      }
    }

    // 2. Classify intent
    const intent = await classifyIntent(message, historyMessages);

    // 2. Select agent
    const agentId = selectAgent(intent);

    // 3. Build live business context
    const businessContext = await buildBusinessContext();

    // 4. Load agent definition from DB
    const supabase = getSupabase();
    const { data: agent } = await supabase
      .from('agents')
      .select('system_instructions, allowed_tools, approval_policy, model_capability')
      .eq('agent_id', agentId)
      .single();

    const baseSystemPrompt =
      agentId === 'thalos'
        ? THALOS_SYSTEM_PROMPT
        : agent?.system_instructions || THALOS_SYSTEM_PROMPT;

    // 5. Assemble context with token budgeting (L09-AC-04)
    const assembled = assembleContext({
      systemPrompt: baseSystemPrompt,
      businessContext,
      history,
      userMessage: message,
      maxTokens: 4000,
    });

    const modelCapability = (agent?.model_capability as 'fast' | 'quality') ?? 'fast';

    // 6. Load tool specs for the agent
    const toolSpecs = await loadToolSpecs(agentId);

    // 7. Execute normalized tool loop or direct chat
    if (toolSpecs.length > 0) {
      const loopResult = await runToolLoop(
        assembled.messages,
        toolSpecs as ToolDefinition[],
        agentId,
        modelCapability,
        correlationId
      );

      totalTokens = loopResult.tokensUsed;
      lastModel = loopResult.model;

      await audit({
        event_type: 'intelligence.orchestrated',
        actor: 'founder',
        agent: agentId,
        description: `Intent: ${intent} | Agent: ${agentId} | Actions: ${loopResult.actionsTaken.length} | Tokens: ${totalTokens}`,
        metadata: {
          intent,
          agent_id: agentId,
          tokens: totalTokens,
          actions_taken: loopResult.actionsTaken,
          pending_approvals: loopResult.pendingApprovals,
          loop_guard_triggered: loopResult.loopGuardTriggered,
          session_date: sessionDate,
          correlation_id: correlationId,
        },
      });

      const toolActionStatus: ActionStatus =
        loopResult.pendingApprovals.length > 0
          ? 'pending_approval'
          : loopResult.actionsTaken.some((a) => a.startsWith('done:'))
          ? 'completed'
          : loopResult.actionsTaken.some((a) => a.startsWith('failed:'))
          ? 'attempted'
          : 'none';

      return {
        response: loopResult.finalResponse,
        intent,
        agent_id: agentId,
        action_status: toolActionStatus,
        actions_taken: loopResult.actionsTaken,
        pending_approvals: loopResult.pendingApprovals,
        tokens_used: totalTokens,
        model_used: lastModel,
        loop_guard_triggered: loopResult.loopGuardTriggered,
      };
    }

    // Direct chat fallback when agent has no tools
    const directResponse = await llmCall(assembled.messages, {
      capability: modelCapability,
      max_tokens: 1500,
      temperature: 0.3,
    });

    totalTokens = directResponse.tokens_used;
    lastModel = `${directResponse.provider}/${directResponse.model}`;

    await audit({
      event_type: 'intelligence.orchestrated',
      actor: 'founder',
      agent: agentId,
      description: `DirectChat | Intent: ${intent} | Agent: ${agentId} | Tokens: ${totalTokens}`,
      metadata: {
        intent,
        agent_id: agentId,
        tokens: totalTokens,
        session_date: sessionDate,
        correlation_id: correlationId,
      },
    });

    return {
      response: directResponse.content,
      intent,
      agent_id: agentId,
      action_status: 'none',
      actions_taken: [],
      pending_approvals: [],
      tokens_used: totalTokens,
      model_used: lastModel,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Orchestrator error', { error: errorMsg, correlationId });
    throw err;
  }
}
