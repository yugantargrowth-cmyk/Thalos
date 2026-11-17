/**
 * Context Assembly and Token Budgeting
 * ─────────────────────────────────────────────────────────────
 * Implements token budgeting, context pruning, source attribution,
 * and relevance rules for the THALOS Intelligence Layer (L09-AC-04).
 */

import { LLMMessage } from './llmClient.js';

export interface ContextAssemblyOptions {
  systemPrompt: string;
  businessContext?: string;
  history: Array<{ role: string; content: string; timestamp?: string }>;
  userMessage: string;
  maxTokens?: number; // Total budget for prompt (default: 4000)
  maxHistoryTokens?: number; // Budget reserved for conversation history (default: 2000)
}

export interface AssembledContext {
  messages: LLMMessage[];
  estimatedTokens: number;
  historyPrunedCount: number;
  sourcesAttributed: string[];
}

/**
 * Fast token estimation heuristic (~4 characters per token for English text/JSON).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Assemble context adhering to strict token budgets and relevance prioritization.
 *
 * Priority order:
 * 1. System Prompt + Core Instructions (Always preserved)
 * 2. Live Business Context (Preserved if within remaining budget)
 * 3. Immediate User Message (Always preserved)
 * 4. Recent Conversation History (Pruned from oldest to newest to fit budget)
 */
export function assembleContext(options: ContextAssemblyOptions): AssembledContext {
  const {
    systemPrompt,
    businessContext,
    history,
    userMessage,
    maxTokens = 4000,
    maxHistoryTokens = 2000,
  } = options;

  const sourcesAttributed: string[] = [];

  // 1. Build System Instruction with Business Context
  let fullSystemContent = systemPrompt.trim();
  if (businessContext && businessContext.trim()) {
    fullSystemContent += `\n\n## Live Business Context\n${businessContext.trim()}`;
    sourcesAttributed.push('business_context_snapshot');
  }

  const systemMessage: LLMMessage = {
    role: 'system',
    content: fullSystemContent,
  };

  const userMsg: LLMMessage = {
    role: 'user',
    content: userMessage.trim(),
  };

  const systemTokens = estimateTokens(systemMessage.content);
  const userTokens = estimateTokens(userMsg.content);

  // Available token budget for history
  const remainingBudget = Math.max(0, maxTokens - systemTokens - userTokens);
  const effectiveHistoryBudget = Math.min(remainingBudget, maxHistoryTokens);

  // 2. Filter & Prune History (newest first, then reverse)
  const prunedHistory: LLMMessage[] = [];
  let currentHistoryTokens = 0;
  let historyPrunedCount = 0;

  // Process history in reverse order (most recent first)
  const reversedHistory = [...history].reverse();

  for (const item of reversedHistory) {
    if (!item.content || !item.content.trim()) continue;

    // Normalize role
    const role: 'user' | 'assistant' = item.role === 'assistant' ? 'assistant' : 'user';
    const msgTokens = estimateTokens(item.content);

    if (currentHistoryTokens + msgTokens <= effectiveHistoryBudget) {
      prunedHistory.unshift({
        role,
        content: item.content.trim(),
      });
      currentHistoryTokens += msgTokens;
      if (item.timestamp) {
        sourcesAttributed.push(`history_${item.timestamp}`);
      }
    } else {
      historyPrunedCount++;
    }
  }

  // 3. Assemble final messages array
  const messages: LLMMessage[] = [
    systemMessage,
    ...prunedHistory,
    userMsg,
  ];

  const totalTokens = systemTokens + currentHistoryTokens + userTokens;

  return {
    messages,
    estimatedTokens: totalTokens,
    historyPrunedCount,
    sourcesAttributed,
  };
}
