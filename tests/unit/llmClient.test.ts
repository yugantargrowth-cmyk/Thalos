import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAvailableProviders, llmCall, LLMMessage, ToolDefinition } from '../../src/intelligence/llmClient.js';

// Mock vault
vi.mock('../../src/lib/vault.js', () => ({
  decryptCredential: vi.fn().mockImplementation((val: string) => `decrypted_${val}`),
}));

// Mock supabase
const mockSupabase = {
  from: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

// Mock Groq SDK
const mockGroqCreate = vi.fn();
vi.mock('groq-sdk', () => ({
  default: class {
    chat = {
      completions: {
        create: (...args: any[]) => mockGroqCreate(...args),
      },
    };
  },
}));

// Mock node-fetch for Gemini and Cloudflare
const mockFetch = vi.fn();
vi.mock('node-fetch', () => ({
  default: (...args: any[]) => mockFetch(...args),
}));

describe('LLM Client and Provider Abstraction (L09-AC-01, L09-AC-02, L09-AC-03, L09-AC-07, L09-AC-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discovers available providers and capability flags (L09-AC-01)', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { status: 'operational', metadata: { _enc: 'dummy_enc' } },
            error: null,
          }),
        }),
      }),
    });

    const providers = await getAvailableProviders();
    expect(providers.length).toBe(3);

    const groq = providers.find(p => p.provider === 'groq');
    expect(groq?.chat).toBe(true);
    expect(groq?.toolCalling).toBe(true);

    const gemini = providers.find(p => p.provider === 'gemini');
    expect(gemini?.chat).toBe(true);
    expect(gemini?.toolCalling).toBe(true);
    expect(gemini?.embeddings).toBe(true);

    const cf = providers.find(p => p.provider === 'cloudflare');
    expect(cf?.chat).toBe(true);
    expect(cf?.toolCalling).toBe(false); // Explicit unsupported tool calling
  });

  it('routes fast capability to Groq and normalizes response (L09-AC-02)', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { status: 'operational', metadata: { _enc: 'groq_enc' } },
            error: null,
          }),
        }),
      }),
    });

    mockGroqCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Groq reply', role: 'assistant' }, finish_reason: 'stop' }],
      usage: { total_tokens: 42 },
    });

    const messages: LLMMessage[] = [{ role: 'user', content: 'Hello' }];
    const res = await llmCall(messages, { capability: 'fast' });

    expect(res.provider).toBe('groq');
    expect(res.content).toBe('Groq reply');
    expect(res.tokens_used).toBe(42);
  });

  it('routes quality capability to Gemini (L09-AC-02)', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { status: 'operational', metadata: { _enc: 'gemini_enc' } },
            error: null,
          }),
        }),
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{
          content: { parts: [{ text: 'Gemini quality reply' }] },
          finishReason: 'STOP',
        }],
        usageMetadata: { totalTokenCount: 88 },
      }),
    });

    const messages: LLMMessage[] = [{ role: 'user', content: 'Explain physics' }];
    const res = await llmCall(messages, { capability: 'quality' });

    expect(res.provider).toBe('gemini');
    expect(res.content).toBe('Gemini quality reply');
    expect(res.tokens_used).toBe(88);
  });

  it('falls back to secondary provider when primary fails (L09-AC-02)', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { status: 'operational', metadata: { _enc: 'key_enc' } },
            error: null,
          }),
        }),
      }),
    });

    // Groq fails with 503
    mockGroqCreate.mockRejectedValueOnce(new Error('Groq 503 Service Unavailable'));

    // Gemini succeeds as fallback
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{
          content: { parts: [{ text: 'Fallback reply from Gemini' }] },
          finishReason: 'STOP',
        }],
        usageMetadata: { totalTokenCount: 50 },
      }),
    });

    const messages: LLMMessage[] = [{ role: 'user', content: 'Test fallback' }];
    const res = await llmCall(messages, { capability: 'fast' });

    expect(res.provider).toBe('gemini');
    expect(res.content).toBe('Fallback reply from Gemini');
  });

  it('normalizes tool calls across providers (L09-AC-03)', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { status: 'operational', metadata: { _enc: 'groq_enc' } },
            error: null,
          }),
        }),
      }),
    });

    mockGroqCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: {
              name: 'web_search',
              arguments: JSON.stringify({ query: 'Ahmedabad tech news' }),
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { total_tokens: 30 },
    });

    const tools: ToolDefinition[] = [{
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search web',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    }];

    const res = await llmCall([{ role: 'user', content: 'Search news' }], { tools });

    expect(res.tool_calls).toBeDefined();
    expect(res.tool_calls?.length).toBe(1);
    expect(res.tool_calls?.[0].function.name).toBe('web_search');
    expect(JSON.parse(res.tool_calls?.[0].function.arguments || '{}')).toEqual({ query: 'Ahmedabad tech news' });
  });

  it('throws descriptive error redacting keys when all providers fail (L09-AC-08, L09-AC-09)', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { status: 'operational', metadata: { _enc: 'key_enc' } },
            error: null,
          }),
        }),
      }),
    });

    // Groq error with secret key in url/msg
    mockGroqCreate.mockRejectedValueOnce(new Error('Groq failed with key=secret_123456789'));
    // Gemini error
    mockFetch.mockRejectedValueOnce(new Error('Gemini failed with key=secret_987654321'));
    // Cloudflare error
    mockFetch.mockRejectedValueOnce(new Error('Cloudflare failed'));

    try {
      await llmCall([{ role: 'user', content: 'Hello' }], { capability: 'fast' });
      expect.fail('Expected llmCall to throw when all providers fail');
    } catch (err: any) {
      expect(err.message).toContain('All LLM providers failed');
      expect(err.message).not.toContain('secret_123456789');
      expect(err.message).toContain('key=[REDACTED]');
    }
  });
});
