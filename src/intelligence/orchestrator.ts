/**
 * THALOS Orchestrator — Phase 1
 * ─────────────────────────────────────────────────────────────
 * Receives founder message → classifies intent → delegates to
 * the right agent → runs a tool-call loop (up to MAX_STEPS) →
 * synthesises and returns results honestly.
 *
 * Tool invocation flow:
 *   1. LLM selects tools from the agent's allowed_tools
 *   2. Each tool call is dispatched through toolDispatcher
 *   3. Tools requiring approval are queued — NOT executed
 *   4. Results feed back into the LLM for the next step
 *   5. Loop ends on 'stop' finish_reason or MAX_STEPS
 */

import Groq from 'groq-sdk';
import { getSupabase } from '../lib/supabase.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { llmCall, LLMMessage } from './llmClient.js';
import { executeTool } from '../execution/toolDispatcher.js';
import { loadToolSpecs } from './toolRegistry.js';

export interface OrchestrateInput {
  message: string;
  history: Array<{ role: string; content: string; timestamp: string }>;
  sessionDate: string;
}

export interface OrchestrateResult {
  response: string;
  intent?: string;
  actions_taken?: string[];
  pending_approvals?: string[];
  tokens_used?: number;
  model_used?: string;
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
async function classifyIntent(message: string, history: LLMMessage[]): Promise<string> {
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
}

/** Select the right specialist agent for a given intent */
function selectAgent(intent: string): string {
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
async function buildBusinessContext(): Promise<string> {
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

/**
 * Phase 1 tool-call loop using Groq native function calling.
 * Falls back to plain text response if Groq is unavailable.
 */
async function runToolLoop(
  systemPrompt: string,
  messages: Groq.Chat.ChatCompletionMessageParam[],
  tools: Groq.Chat.ChatCompletionTool[],
  agentId: string,
  apiKey: string,
): Promise<{
  finalResponse: string;
  actionsTaken: string[];
  pendingApprovals: string[];
  tokensUsed: number;
  model: string;
}> {
  const groq = new Groq({ apiKey });
  const groqModel = 'llama-3.3-70b-versatile'; // Best for tool calling
  const actionsTaken: string[] = [];
  const pendingApprovals: string[] = [];
  let tokensUsed = 0;

  const loopMessages = [...messages];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await groq.chat.completions.create({
      model: groqModel,
      messages: loopMessages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      max_tokens: 1200,
      temperature: 0.3,
    });

    tokensUsed += response.usage?.total_tokens ?? 0;
    const choice = response.choices[0];

    // No tool calls → done
    if (!choice.message.tool_calls?.length || choice.finish_reason === 'stop') {
      return {
        finalResponse: choice.message.content ?? '',
        actionsTaken,
        pendingApprovals,
        tokensUsed,
        model: `groq/${groqModel}`,
      };
    }

    // Push assistant message with tool calls
    loopMessages.push(choice.message);

    // Execute each tool call
    for (const tc of choice.message.tool_calls) {
      const toolId = tc.function.name;
      let inputs: Record<string, unknown> = {};
      try {
        inputs = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        // malformed JSON — pass empty inputs
      }

      logger.info('Tool call', { tool_id: toolId, agent_id: agentId, step });

      const result = await executeTool({ tool_id: toolId, agent_id: agentId, inputs });

      if (result.queued_for_approval) {
        const approvalSummary = `${toolId}(${JSON.stringify(inputs).slice(0, 80)})`;
        pendingApprovals.push(result.approval_id ?? approvalSummary);
        actionsTaken.push(`queued:${toolId}`);
        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ queued: true, approval_id: result.approval_id, note: 'Requires Shlok approval before execution' }),
        });
      } else if (result.success) {
        actionsTaken.push(`done:${toolId}`);
        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ success: true, output: result.output, evidence: result.evidence }),
        });
      } else {
        actionsTaken.push(`failed:${toolId}`);
        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ success: false, error: result.error }),
        });
      }
    }
  }

  // Exhausted steps — ask LLM to synthesise what we have
  const synthResponse = await groq.chat.completions.create({
    model: groqModel,
    messages: [...loopMessages, {
      role: 'user',
      content: 'Summarise what has been done so far and what still needs attention.',
    }],
    max_tokens: 600,
    temperature: 0.2,
  });
  tokensUsed += synthResponse.usage?.total_tokens ?? 0;

  return {
    finalResponse: synthResponse.choices[0]?.message.content ?? 'Processing complete.',
    actionsTaken,
    pendingApprovals,
    tokensUsed,
    model: `groq/${groqModel}`,
  };
}

/** Get the Groq API key from the integration store */
async function getGroqKey(): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('integrations')
      .select('metadata, status')
      .eq('integration_id', 'groq')
      .single();
    if (!data || !['configured', 'connected', 'tested', 'operational'].includes(data.status)) return null;
    const enc = (data.metadata as Record<string, string>)?._enc;
    if (!enc) return null;
    const { decryptCredential } = await import('../lib/vault.js');
    return decryptCredential(enc);
  } catch {
    return null;
  }
}

export async function thalosOrchestrate(input: OrchestrateInput): Promise<OrchestrateResult> {
  const { message, history, sessionDate } = input;
  let totalTokens = 0;
  let lastModel = 'unknown';

  try {
    const historyMessages: LLMMessage[] = history.map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));

    // 1. Classify intent
    const intent = await classifyIntent(message, historyMessages);

    // 2. Select agent
    const agentId = selectAgent(intent);

    // 3. Build context
    const businessContext = await buildBusinessContext();

    // 4. Load agent definition
    const supabase = getSupabase();
    const { data: agent } = await supabase
      .from('agents')
      .select('system_instructions, allowed_tools, approval_policy, model_capability')
      .eq('agent_id', agentId)
      .single();

    const systemPrompt = agentId === 'thalos'
      ? `${THALOS_SYSTEM_PROMPT}\n\nCurrent business context:\n${businessContext}`
      : `${agent?.system_instructions ?? ''}\n\nCurrent business context:\n${businessContext}`;

    // 5. Try Phase 1: Groq native tool calling
    const groqKey = await getGroqKey();
    const toolSpecs = await loadToolSpecs(agentId);

    if (groqKey && toolSpecs.length > 0) {
      const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages.slice(-8).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: message },
      ];

      const loopResult = await runToolLoop(
        systemPrompt,
        groqMessages,
        toolSpecs as Groq.Chat.ChatCompletionTool[],
        agentId,
        groqKey,
      );

      totalTokens = loopResult.tokensUsed;
      lastModel = loopResult.model;

      await audit({
        event_type: 'intelligence.orchestrated',
        actor: 'founder',
        agent: agentId,
        description: `Phase1 | Intent: ${intent} | Agent: ${agentId} | Actions: ${loopResult.actionsTaken.length} | Tokens: ${totalTokens}`,
        metadata: {
          intent, agent_id: agentId, tokens: totalTokens,
          actions_taken: loopResult.actionsTaken,
          pending_approvals: loopResult.pendingApprovals,
          session_date: sessionDate,
          phase: 1,
        },
      });

      return {
        response: loopResult.finalResponse,
        intent,
        actions_taken: loopResult.actionsTaken,
        pending_approvals: loopResult.pendingApprovals,
        tokens_used: totalTokens,
        model_used: lastModel,
      };
    }

    // 6. Phase 0 fallback: plain LLM call when Groq unavailable
    logger.info('Phase 1 unavailable — falling back to Phase 0 (Groq key missing or no tools)', { agentId, intent });

    const llmMessages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages.slice(-10),
      { role: 'user', content: message },
    ];

    const llmResult = await llmCall(llmMessages, {
      capability: (agent?.model_capability as 'fast' | 'quality') ?? 'fast',
      max_tokens: 1500,
      temperature: 0.3,
    });
    totalTokens += llmResult.tokens_used;
    lastModel = `${llmResult.provider}/${llmResult.model}`;

    await audit({
      event_type: 'intelligence.orchestrated',
      actor: 'founder',
      agent: agentId,
      description: `Phase0 | Intent: ${intent} | Agent: ${agentId} | Tokens: ${totalTokens}`,
      metadata: { intent, agent_id: agentId, tokens: totalTokens, session_date: sessionDate, phase: 0 },
    });

    return {
      response: llmResult.content,
      intent,
      actions_taken: [],
      pending_approvals: [],
      tokens_used: totalTokens,
      model_used: lastModel,
    };
  } catch (err) {
    logger.error('Orchestrator error', { err });
    throw err;
  }
}
