import { describe, it, expect } from 'vitest';
import { assembleContext, estimateTokens } from '../../src/intelligence/contextAssembler.js';

describe('Context Assembly and Token Budgeting (L09-AC-04)', () => {
  it('estimates tokens with ~4 chars per token heuristic', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('12345678')).toBe(2);
  });

  it('preserves system prompt, business context, and user message within budget', () => {
    const result = assembleContext({
      systemPrompt: 'You are THALOS.',
      businessContext: 'Active pipeline: 5 leads.',
      history: [
        { role: 'user', content: 'Hello there' },
        { role: 'assistant', content: 'Hello! How can I assist you today?' },
      ],
      userMessage: 'Show me my pipeline.',
      maxTokens: 1000,
    });

    expect(result.messages.length).toBe(4);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toContain('You are THALOS.');
    expect(result.messages[0].content).toContain('Active pipeline: 5 leads.');
    expect(result.messages[result.messages.length - 1].content).toBe('Show me my pipeline.');
    expect(result.historyPrunedCount).toBe(0);
    expect(result.sourcesAttributed).toContain('business_context_snapshot');
  });

  it('prunes older history messages when token budget is exceeded', () => {
    // Generate long history
    const history = [];
    for (let i = 1; i <= 20; i++) {
      history.push({
        role: 'user',
        content: `Very long historical message ${i} ` + 'A'.repeat(200),
        timestamp: `2026-11-18T00:00:${i.toString().padStart(2, '0')}Z`,
      });
      history.push({
        role: 'assistant',
        content: `Very long assistant answer ${i} ` + 'B'.repeat(200),
      });
    }

    const result = assembleContext({
      systemPrompt: 'You are THALOS.',
      history,
      userMessage: 'What is today focus?',
      maxTokens: 500, // Strict small budget
      maxHistoryTokens: 250,
    });

    expect(result.historyPrunedCount).toBeGreaterThan(0);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[result.messages.length - 1].content).toBe('What is today focus?');
    // Ensure total tokens stay within budget limits
    expect(result.estimatedTokens).toBeLessThanOrEqual(500);
  });
});
