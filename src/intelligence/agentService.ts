/**
 * Agent Service & Delegation Runtime
 * ─────────────────────────────────────────────────────────────
 * Implements the nine-agent runtime contracts, configuration validation,
 * founder-facing orchestrator boundaries, bounded task delegation,
 * recursion guards, and structured provenance tracking (Mission L10).
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase } from '../lib/supabase.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { executeTool } from '../execution/toolDispatcher.js';
import { loadToolSpecs, TOOL_PARAMS } from './toolRegistry.js';
import { llmCall, LLMMessage, ToolDefinition } from './llmClient.js';

export const CANONICAL_AGENTS = [
  'thalos',
  'scout',
  'hunter',
  'closer',
  'operator',
  'spark',
  'publisher',
  'analyst',
  'researcher',
] as const;

export type CanonicalAgentId = typeof CANONICAL_AGENTS[number];

export interface AgentRecord {
  id: string;
  agent_id: CanonicalAgentId | string;
  display_name: string;
  version: string;
  mission: string;
  status: 'active' | 'suspended' | 'deprecated';
  system_instructions: string;
  allowed_tools: string[];
  prohibited_actions?: string[];
  model_capability: 'fast' | 'quality';
  approval_policy: 'auto' | 'notify' | 'require' | 'forbidden';
  risk_classification: 'low' | 'medium' | 'high' | 'critical';
  max_steps: number;
  max_tokens_per_step?: number;
  timeout_seconds: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export const AgentUpdateSchema = z.object({
  display_name: z.string().min(2).max(50).optional(),
  mission: z.string().min(10).max(500).optional(),
  system_instructions: z.string().min(20).max(5000).optional(),
  status: z.enum(['active', 'suspended', 'deprecated']).optional(),
  allowed_tools: z.array(z.string()).refine(
    (tools) => tools.every((t) => t in TOOL_PARAMS),
    { message: 'All allowed_tools must be registered in TOOL_PARAMS' }
  ).optional(),
  model_capability: z.enum(['fast', 'quality']).optional(),
  approval_policy: z.enum(['auto', 'notify', 'require', 'forbidden']).optional(),
  risk_classification: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  max_steps: z.number().int().min(1).max(50).optional(),
  timeout_seconds: z.number().int().min(5).max(600).optional(),
});

export type AgentUpdateInput = z.infer<typeof AgentUpdateSchema>;

export interface TaskDelegationRequest {
  delegation_id?: string;
  from_agent: string;
  to_agent: string;
  task_type: string;
  input: Record<string, unknown>;
  context?: Record<string, unknown>;
  deadline_seconds?: number;
  max_steps?: number;
  delegation_stack?: string[]; // for recursion & cycle prevention
  correlation_id?: string;
}

export interface TaskDelegationResult {
  delegation_id: string;
  from_agent: string;
  to_agent: string;
  status: 'completed' | 'failed' | 'awaiting_approval' | 'timeout';
  output?: Record<string, unknown>;
  error?: string;
  evidence?: string;
  provenance: {
    agent_id: string;
    model_used: string;
    tokens_used: number;
    duration_ms: number;
    tools_executed: string[];
  };
}

export const MAX_DELEGATION_DEPTH = 3;

export class AgentService {
  /** Check if an agent ID belongs to the canonical 9-agent roster (L10-AC-01) */
  isCanonicalAgent(agentId: string): boolean {
    return CANONICAL_AGENTS.includes(agentId as CanonicalAgentId);
  }

  /** Retrieve an agent record by ID */
  async getAgent(agentId: string): Promise<AgentRecord | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('agent_id', agentId)
      .maybeSingle();

    if (error || !data) return null;
    return data as AgentRecord;
  }

  /** List all agents in the roster (L10-AC-01) */
  async listAgents(): Promise<AgentRecord[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('agent_id', { ascending: true });

    if (error) throw new Error(`Failed to list agents: ${error.message}`);
    return (data ?? []) as AgentRecord[];
  }

  /** Update an agent's configuration with strict validation and audit logging (L10-AC-02, L10-AC-03) */
  async updateAgent(
    agentId: string,
    updates: AgentUpdateInput,
    actor: string = 'founder'
  ): Promise<AgentRecord> {
    if (!this.isCanonicalAgent(agentId)) {
      throw new Error(`Cannot modify non-canonical agent: ${agentId}`);
    }

    const validated = AgentUpdateSchema.parse(updates);
    const supabase = getSupabase();

    const existing = await this.getAgent(agentId);
    if (!existing) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const { data: updated, error } = await supabase
      .from('agents')
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId)
      .select('*')
      .single();

    if (error || !updated) {
      throw new Error(`Failed to update agent ${agentId}: ${error?.message}`);
    }

    await audit({
      event_type: 'agent.updated',
      entity_type: 'agent',
      entity_id: agentId,
      actor,
      description: `Agent ${agentId} configuration updated by ${actor}`,
      metadata: { previous: existing, updated: validated },
    });

    return updated as AgentRecord;
  }

  /**
   * Enforce that THALOS is the only founder-facing orchestrator (L10-AC-04).
   * Specialist agents may only execute delegated work.
   */
  assertFounderFacingOrchestrator(agentId: string): void {
    if (agentId !== 'thalos') {
      throw new Error(
        `Direct founder conversation is reserved for 'thalos'. Specialist agent '${agentId}' cannot bypass orchestrator.`
      );
    }
  }

  /**
   * Execute bounded task delegation between agents (L10-AC-05, L10-AC-06, L10-AC-07, L10-AC-08).
   */
  async delegateTask(request: TaskDelegationRequest): Promise<TaskDelegationResult> {
    const startTime = Date.now();
    const delegationId = request.delegation_id || uuidv4();
    const {
      from_agent,
      to_agent,
      task_type,
      input,
      context = {},
      deadline_seconds = 60,
      max_steps = 10,
      delegation_stack = [from_agent],
      correlation_id,
    } = request;

    // 1. Validate agents
    if (!this.isCanonicalAgent(to_agent)) {
      throw new Error(`Target agent '${to_agent}' is not a valid canonical agent`);
    }

    // 2. Recursion & Cycle Prevention (L10-AC-06)
    if (delegation_stack.includes(to_agent)) {
      const err = `Cyclic delegation detected: '${to_agent}' is already in delegation chain [${delegation_stack.join(' -> ')}].`;
      logger.error('Cyclic delegation rejected', { delegation_stack, to_agent });
      return {
        delegation_id: delegationId,
        from_agent,
        to_agent,
        status: 'failed',
        error: err,
        provenance: {
          agent_id: to_agent,
          model_used: 'none',
          tokens_used: 0,
          duration_ms: Date.now() - startTime,
          tools_executed: [],
        },
      };
    }

    if (delegation_stack.length >= MAX_DELEGATION_DEPTH) {
      const err = `Maximum delegation depth (${MAX_DELEGATION_DEPTH}) exceeded. Uncontrolled recursion prevented.`;
      logger.error('Delegation depth exceeded', { delegation_stack, to_agent });
      return {
        delegation_id: delegationId,
        from_agent,
        to_agent,
        status: 'failed',
        error: err,
        provenance: {
          agent_id: to_agent,
          model_used: 'none',
          tokens_used: 0,
          duration_ms: Date.now() - startTime,
          tools_executed: [],
        },
      };
    }

    if (to_agent === 'thalos') {
      const err = `Specialist agent '${from_agent}' cannot delegate upward to orchestrator 'thalos'.`;
      return {
        delegation_id: delegationId,
        from_agent,
        to_agent,
        status: 'failed',
        error: err,
        provenance: {
          agent_id: to_agent,
          model_used: 'none',
          tokens_used: 0,
          duration_ms: Date.now() - startTime,
          tools_executed: [],
        },
      };
    }

    // 3. Load Target Agent Definition
    const targetAgent = await this.getAgent(to_agent);
    if (!targetAgent) {
      throw new Error(`Agent definition not found: ${to_agent}`);
    }

    if (targetAgent.status !== 'active') {
      return {
        delegation_id: delegationId,
        from_agent,
        to_agent,
        status: 'failed',
        error: `Agent '${to_agent}' is currently ${targetAgent.status}`,
        provenance: {
          agent_id: to_agent,
          model_used: 'none',
          tokens_used: 0,
          duration_ms: Date.now() - startTime,
          tools_executed: [],
        },
      };
    }

    await audit({
      event_type: 'agent.delegation_started',
      entity_type: 'delegation',
      entity_id: delegationId,
      actor: from_agent,
      agent: to_agent,
      description: `Delegation started: ${from_agent} -> ${to_agent} [${task_type}]`,
      metadata: { delegation_stack, correlation_id },
    });

    // 4. Load allowed tools and build prompt
    const toolSpecs = await loadToolSpecs(to_agent);
    const toolsExecuted: string[] = [];
    let totalTokens = 0;
    let modelUsed = targetAgent.model_capability === 'quality' ? 'gemini/gemini-1.5-flash' : 'groq/llama-3.3-70b-versatile';

    const systemPrompt = `${targetAgent.system_instructions}\n\nYou have been delegated a subtask by ${from_agent}.\nTask Type: ${task_type}\nContext: ${JSON.stringify(context)}`;
    const userPrompt = `Execute the delegated task with inputs: ${JSON.stringify(input)}. Use only your permitted tools. Report truthful results.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const effectiveMaxSteps = Math.min(max_steps, targetAgent.max_steps);
    const deadlineMs = Math.min(deadline_seconds, targetAgent.timeout_seconds) * 1000;

    // 5. Bounded Tool-Calling Loop
    try {
      for (let step = 0; step < effectiveMaxSteps; step++) {
        // Check timeout
        if (Date.now() - startTime > deadlineMs) {
          return {
            delegation_id: delegationId,
            from_agent,
            to_agent,
            status: 'timeout',
            error: `Delegation exceeded timeout of ${deadline_seconds} seconds`,
            provenance: {
              agent_id: to_agent,
              model_used: modelUsed,
              tokens_used: totalTokens,
              duration_ms: Date.now() - startTime,
              tools_executed: toolsExecuted,
            },
          };
        }

        const response = await llmCall(messages, {
          tools: toolSpecs as ToolDefinition[],
          capability: targetAgent.model_capability,
          max_tokens: 1500,
          timeout_ms: Math.max(5000, deadlineMs - (Date.now() - startTime)),
        });

        totalTokens += response.tokens_used;
        modelUsed = `${response.provider}/${response.model}`;

        // If no tool calls, delegation work is done
        if (!response.tool_calls || response.tool_calls.length === 0) {
          let parsedOutput: Record<string, unknown> = { summary: response.content };
          try {
            parsedOutput = JSON.parse(response.content) as Record<string, unknown>;
          } catch {
            // plain text summary
          }

          const durationMs = Date.now() - startTime;
          await audit({
            event_type: 'agent.delegation_completed',
            entity_type: 'delegation',
            entity_id: delegationId,
            actor: to_agent,
            description: `Delegation ${from_agent} -> ${to_agent} completed in ${durationMs}ms`,
            metadata: { tools_executed: toolsExecuted, tokens: totalTokens, correlation_id },
          });

          return {
            delegation_id: delegationId,
            from_agent,
            to_agent,
            status: 'completed',
            output: parsedOutput,
            evidence: `Completed by ${to_agent} via ${modelUsed}`,
            provenance: {
              agent_id: to_agent,
              model_used: modelUsed,
              tokens_used: totalTokens,
              duration_ms: durationMs,
              tools_executed: toolsExecuted,
            },
          };
        }

        messages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.tool_calls,
        });

        // Execute tools
        for (const tc of response.tool_calls) {
          const toolId = tc.function.name;

          // Verify tool is in target agent's allowed_tools (L10-AC-08)
          if (!targetAgent.allowed_tools.includes(toolId)) {
            const forbiddenErr = `Agent '${to_agent}' is forbidden from calling tool '${toolId}'`;
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: toolId,
              content: JSON.stringify({ success: false, error: forbiddenErr }),
            });
            continue;
          }

          let toolInputs: Record<string, unknown> = {};
          try {
            toolInputs = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
          } catch {
            toolInputs = {};
          }

          toolsExecuted.push(toolId);
          const execResult = await executeTool({
            tool_id: toolId,
            agent_id: to_agent,
            inputs: toolInputs,
            correlation_id,
          });

          if (execResult.queued_for_approval) {
            return {
              delegation_id: delegationId,
              from_agent,
              to_agent,
              status: 'awaiting_approval',
              output: {
                approval_id: execResult.approval_id,
                tool_id: toolId,
                queued: true,
              },
              evidence: `Tool ${toolId} queued for approval`,
              provenance: {
                agent_id: to_agent,
                model_used: modelUsed,
                tokens_used: totalTokens,
                duration_ms: Date.now() - startTime,
                tools_executed: toolsExecuted,
              },
            };
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: toolId,
            content: JSON.stringify({
              success: execResult.success,
              output: execResult.output,
              evidence: execResult.evidence,
              error: execResult.error,
            }),
          });
        }
      }

      // Exhausted steps
      return {
        delegation_id: delegationId,
        from_agent,
        to_agent,
        status: 'completed',
        output: { summary: `Delegation completed after reaching maximum steps limit (${effectiveMaxSteps})` },
        provenance: {
          agent_id: to_agent,
          model_used: modelUsed,
          tokens_used: totalTokens,
          duration_ms: Date.now() - startTime,
          tools_executed: toolsExecuted,
        },
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('Delegation failure', { delegationId, to_agent, error: errMsg });

      return {
        delegation_id: delegationId,
        from_agent,
        to_agent,
        status: 'failed',
        error: errMsg,
        provenance: {
          agent_id: to_agent,
          model_used: modelUsed,
          tokens_used: totalTokens,
          duration_ms: Date.now() - startTime,
          tools_executed: toolsExecuted,
        },
      };
    }
  }
}

export const agentService = new AgentService();
