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
import { llmCall, LLMMessage, ToolDefinition } from './llmClient.js';
import { executeTool } from '../execution/toolDispatcher.js';
import { loadToolSpecs } from './toolRegistry.js';
import { assembleContext } from './contextAssembler.js';

export interface OrchestrateInput {
  message: string;
  history: Array<{ role: string; content: string; timestamp?: string }>;
  sessionDate: string;
  correlationId?: string;
}

export interface OrchestrateResult {
  response: string;
  intent?: string;
  agent_id?: string;
  actions_taken?: string[];
  pending_approvals?: string[];
  tokens_used?: number;
  model_used?: string;
  loop_guard_triggered?: boolean;
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
 * Main THALOS Orchestration Entry Point
 */
export async function thalosOrchestrate(input: OrchestrateInput): Promise<OrchestrateResult> {
  const { message, history, sessionDate, correlationId } = input;
  let totalTokens = 0;
  let lastModel = 'unknown';

  try {
    const historyMessages: LLMMessage[] = history.map((h) => ({
      role: (h.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: h.content,
    }));

    // 1. Classify intent
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

      return {
        response: loopResult.finalResponse,
        intent,
        agent_id: agentId,
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
