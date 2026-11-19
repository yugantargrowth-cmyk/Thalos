/**
 * LLM Client — Provider Abstraction and Tool-Call Normalization
 * ─────────────────────────────────────────────────────────────
 * Normalizes chat and tool-calling across providers:
 * Priority: Groq (fast) → Gemini (quality) → Cloudflare (last resort)
 *
 * Implements:
 * - Provider capability discovery (L09-AC-01)
 * - Model routing & fallback policy (L09-AC-02)
 * - Normalized tool calling across Groq and Gemini (L09-AC-03)
 * - Timeout enforcement & abort controllers (L09-AC-07)
 * - Sensitive payload protection & credential redaction (L09-AC-09)
 */

import Groq from 'groq-sdk';
import { getSupabase } from '../lib/supabase.js';
import { decryptCredential } from '../lib/vault.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  tokens_used: number;
  tool_calls?: LLMToolCall[];
  finish_reason?: string;
}

export interface LLMOptions {
  model?: string;
  provider?: string;
  capability?: 'fast' | 'quality'; // fast=groq, quality=gemini
  max_tokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required';
  timeout_ms?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'gemini' | 'groq' | 'openai' | 'cloudflare';
  recommended?: boolean;
  contextWindow?: string;
  speed?: 'Ultra Fast' | 'Fast' | 'Balanced' | 'Deep Reasoning';
  capabilities?: string[];
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  // Google Gemini
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', recommended: true, contextWindow: '1M tokens', speed: 'Ultra Fast', capabilities: ['chat', 'tools', 'vision'] },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini', contextWindow: '2M tokens', speed: 'Deep Reasoning', capabilities: ['chat', 'tools', 'code'] },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini', contextWindow: '1M tokens', speed: 'Ultra Fast', capabilities: ['chat', 'tools'] },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', contextWindow: '1M tokens', speed: 'Fast', capabilities: ['chat', 'tools'] },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', contextWindow: '2M tokens', speed: 'Balanced', capabilities: ['chat', 'tools'] },

  // Groq
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', provider: 'groq', recommended: true, contextWindow: '128K tokens', speed: 'Fast', capabilities: ['chat', 'tools'] },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', provider: 'groq', contextWindow: '128K tokens', speed: 'Ultra Fast', capabilities: ['chat', 'tools'] },
  { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B', provider: 'groq', contextWindow: '128K tokens', speed: 'Deep Reasoning', capabilities: ['chat', 'reasoning'] },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B 32k', provider: 'groq', contextWindow: '32K tokens', speed: 'Fast', capabilities: ['chat', 'tools'] },
  { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT', provider: 'groq', contextWindow: '8K tokens', speed: 'Ultra Fast', capabilities: ['chat'] },

  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: '128K tokens', speed: 'Deep Reasoning', capabilities: ['chat', 'tools', 'vision'] },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', recommended: true, contextWindow: '128K tokens', speed: 'Ultra Fast', capabilities: ['chat', 'tools'] },
  { id: 'o3-mini', name: 'o3-mini', provider: 'openai', contextWindow: '200K tokens', speed: 'Deep Reasoning', capabilities: ['chat', 'reasoning'] },

  // Cloudflare Workers AI
  { id: '@cf/meta/llama-3.1-8b-instruct', name: 'Cloudflare Llama 3.1 8B', provider: 'cloudflare', contextWindow: '8K tokens', speed: 'Balanced', capabilities: ['chat'] },
];

export interface ProviderCapability {
  provider: string;
  configured: boolean;
  chat: boolean;
  toolCalling: boolean;
  embeddings: boolean;
  primaryModel: string;
  fallbackModel?: string;
}

/** Retrieve and decrypt a provider API key from settings or the integration store */
async function getProviderKey(integrationId: string): Promise<string> {
  const settingsKey = (config.integrations as Record<string, any>)?.[integrationId]?.apiKey;
  if (settingsKey && typeof settingsKey === 'string' && settingsKey.trim()) {
    return settingsKey.trim();
  }

  const supabase = getSupabase();
  const { data } = await supabase
    .from('integrations')
    .select('metadata, status')
    .eq('integration_id', integrationId)
    .single();

  if (!data || !['configured', 'connected', 'tested', 'operational'].includes(data.status)) {
    throw new Error(`Integration '${integrationId}' is not configured in settings.json or database`);
  }

  const enc = (data.metadata as Record<string, string>)?._enc;
  if (!enc) throw new Error(`No credential found for integration '${integrationId}'`);

  return decryptCredential(enc);
}

/** Discover configured LLM providers and their capabilities (L09-AC-01) */
export async function getAvailableProviders(): Promise<ProviderCapability[]> {
  const groqPrimary = (config.integrations as Record<string, any>)?.groq?.primaryModel || 'llama-3.3-70b-versatile';
  const geminiPrimary = (config.integrations as Record<string, any>)?.gemini?.primaryModel || 'gemini-1.5-flash';

  const providers: ProviderCapability[] = [
    {
      provider: 'groq',
      configured: false,
      chat: true,
      toolCalling: true,
      embeddings: false,
      primaryModel: groqPrimary,
      fallbackModel: 'llama-3.1-8b-instant',
    },
    {
      provider: 'gemini',
      configured: false,
      chat: true,
      toolCalling: true,
      embeddings: true,
      primaryModel: geminiPrimary,
      fallbackModel: 'gemini-1.5-pro',
    },
    {
      provider: 'cloudflare',
      configured: false,
      chat: true,
      toolCalling: false, // Explicit: Cloudflare Workers AI does not normalize function calling in this tier
      embeddings: false,
      primaryModel: '@cf/meta/llama-3.1-8b-instruct',
    },
  ];

  for (const p of providers) {
    try {
      const key = await getProviderKey(p.provider);
      p.configured = Boolean(key && key.trim().length > 0);
    } catch {
      p.configured = false;
    }
  }

  return providers;
}

/** Call Groq — fast tier, native tool calling */
async function callGroq(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const key = await getProviderKey('groq');
  const timeoutMs = options.timeout_ms ?? 30000;
  const groq = new Groq({ apiKey: key, timeout: timeoutMs });

  const settingsModel = (config.integrations as Record<string, any>)?.groq?.primaryModel;
  const model = options.model
    ?? settingsModel
    ?? (options.capability === 'quality' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant');

  // Format messages for Groq
  const formattedMessages: Groq.Chat.ChatCompletionMessageParam[] = messages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.tool_call_id || 'unknown_call',
        content: m.content,
      } as Groq.Chat.ChatCompletionToolMessageParam;
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      } as Groq.Chat.ChatCompletionAssistantMessageParam;
    }
    return {
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    };
  });

  const tools = options.tools && options.tools.length > 0
    ? (options.tools as Groq.Chat.ChatCompletionTool[])
    : undefined;

  const response = await groq.chat.completions.create({
    model,
    messages: formattedMessages,
    tools,
    tool_choice: tools ? (options.tool_choice ?? 'auto') : undefined,
    max_tokens: options.max_tokens ?? 2048,
    temperature: options.temperature ?? 0.3,
  });

  const choice = response.choices[0];
  const toolCalls: LLMToolCall[] | undefined = choice.message.tool_calls?.map(tc => ({
    id: tc.id,
    type: 'function',
    function: {
      name: tc.function.name,
      arguments: tc.function.arguments,
    },
  }));

  return {
    content: choice.message.content ?? '',
    model,
    provider: 'groq',
    tokens_used: response.usage?.total_tokens ?? 0,
    tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    finish_reason: choice.finish_reason ?? undefined,
  };
}

/** Call Gemini via REST — quality tier, function declarations */
async function callGemini(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const key = await getProviderKey('gemini');
  const timeoutMs = options.timeout_ms ?? 30000;
  const settingsModel = (config.integrations as Record<string, any>)?.gemini?.primaryModel;
  const model = options.model ?? settingsModel ?? 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  // Format contents for Gemini
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user',
          parts: [{ text: `[Tool Result (${m.name || 'tool'})]: ${m.content}` }],
        };
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content || '' }],
      };
    });

  const systemMsg = messages.find(m => m.role === 'system');

  // Map tools to Gemini functionDeclarations if provided
  let geminiTools: Array<{ functionDeclarations: Array<Record<string, unknown>> }> | undefined;
  if (options.tools && options.tools.length > 0) {
    geminiTools = [
      {
        functionDeclarations: options.tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
    ];
  }

  const body = {
    contents,
    ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
    ...(geminiTools ? { tools: geminiTools } : {}),
    generationConfig: {
      maxOutputTokens: options.max_tokens ?? 2048,
      temperature: options.temperature ?? 0.3,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { default: nodeFetch } = await import('node-fetch');
    const resp = await nodeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal as any,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await resp.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            functionCall?: { name: string; args: Record<string, unknown> };
          }>;
        };
        finishReason?: string;
      }>;
      usageMetadata?: { totalTokenCount: number };
    };

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    let textContent = '';
    const toolCalls: LLMToolCall[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.text) {
        textContent += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_gemini_${Date.now()}_${i}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
        });
      }
    }

    return {
      content: textContent,
      model,
      provider: 'gemini',
      tokens_used: data.usageMetadata?.totalTokenCount ?? 0,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      finish_reason: candidate?.finishReason ?? 'STOP',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Call Cloudflare Workers AI — fallback text-only tier */
async function callCloudflare(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  if (options.tools && options.tools.length > 0) {
    throw new Error('Cloudflare Workers AI does not support tool calling in this tier');
  }

  const key = await getProviderKey('cloudflare');
  let accountId = (config.integrations as Record<string, any>)?.cloudflare?.accountId;
  if (!accountId) {
    const supabase = getSupabase();
    const { data } = await supabase.from('integrations').select('metadata').eq('integration_id', 'cloudflare').single();
    accountId = (data?.metadata as Record<string, string>)?.account_id;
  }
  if (!accountId) throw new Error('Cloudflare account_id not configured in settings.json or integration metadata');

  const timeoutMs = options.timeout_ms ?? 30000;
  const model = '@cf/meta/llama-3.1-8b-instruct';
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { default: nodeFetch } = await import('node-fetch');
    const resp = await nodeFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: options.max_tokens ?? 2048 }),
      signal: controller.signal as any,
    });

    if (!resp.ok) throw new Error(`Cloudflare AI error: ${resp.status}`);
    const data2 = (await resp.json()) as { result: { response: string } };

    return {
      content: data2.result.response,
      model,
      provider: 'cloudflare',
      tokens_used: 0,
      finish_reason: 'stop',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Call OpenAI / Compatible API */
async function callOpenAI(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const key = await getProviderKey('openai');
  const timeoutMs = options.timeout_ms ?? 30000;
  const settingsModel = (config.integrations as Record<string, any>)?.openai?.primaryModel;
  const model = options.model ?? settingsModel ?? 'gpt-4o-mini';

  const formattedMessages = messages.map(m => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id || 'unknown_call', content: m.content };
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model,
    messages: formattedMessages,
    max_tokens: options.max_tokens ?? 2048,
    temperature: options.temperature ?? 0.3,
  };
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    if (options.tool_choice) body.tool_choice = options.tool_choice;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { default: nodeFetch } = await import('node-fetch');
    const resp = await nodeFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal as any,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI API error ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await resp.json()) as any;
    const choice = data.choices?.[0];
    const toolCalls = choice?.message?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    return {
      content: choice?.message?.content ?? '',
      model,
      provider: 'openai',
      tokens_used: data.usage?.total_tokens ?? 0,
      tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      finish_reason: choice?.finish_reason,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Main LLM call with normalized capability routing and provider fallback chain.
 * Satisfies L09-AC-01, L09-AC-02, L09-AC-03, L09-AC-07.
 */
export async function llmCall(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
  const requiresTools = Boolean(options.tools && options.tools.length > 0);
  const providers: Array<{ name: string; fn: () => Promise<LLMResponse> }> = [];

  const providerMap: Record<string, () => Promise<LLMResponse>> = {
    groq: () => callGroq(messages, options),
    gemini: () => callGemini(messages, options),
    openai: () => callOpenAI(messages, options),
    cloudflare: () => callCloudflare(messages, options),
  };

  // If user requested a specific provider explicitly
  if (options.provider && providerMap[options.provider]) {
    providers.push({ name: options.provider, fn: providerMap[options.provider] });
  }

  // Routing matrix based on capabilities and preferences
  if (requiresTools) {
    if (options.capability === 'quality') {
      if (!providers.some(p => p.name === 'gemini')) providers.push({ name: 'gemini', fn: providerMap.gemini });
      if (!providers.some(p => p.name === 'groq')) providers.push({ name: 'groq', fn: providerMap.groq });
      if (!providers.some(p => p.name === 'openai')) providers.push({ name: 'openai', fn: providerMap.openai });
    } else {
      if (!providers.some(p => p.name === 'groq')) providers.push({ name: 'groq', fn: providerMap.groq });
      if (!providers.some(p => p.name === 'gemini')) providers.push({ name: 'gemini', fn: providerMap.gemini });
      if (!providers.some(p => p.name === 'openai')) providers.push({ name: 'openai', fn: providerMap.openai });
    }
  } else {
    if (options.capability === 'quality') {
      if (!providers.some(p => p.name === 'gemini')) providers.push({ name: 'gemini', fn: providerMap.gemini });
      if (!providers.some(p => p.name === 'groq')) providers.push({ name: 'groq', fn: providerMap.groq });
      if (!providers.some(p => p.name === 'openai')) providers.push({ name: 'openai', fn: providerMap.openai });
    } else {
      if (!providers.some(p => p.name === 'groq')) providers.push({ name: 'groq', fn: providerMap.groq });
      if (!providers.some(p => p.name === 'gemini')) providers.push({ name: 'gemini', fn: providerMap.gemini });
      if (!providers.some(p => p.name === 'openai')) providers.push({ name: 'openai', fn: providerMap.openai });
    }
    if (!providers.some(p => p.name === 'cloudflare')) providers.push({ name: 'cloudflare', fn: providerMap.cloudflare });
  }

  const errors: string[] = [];
  for (const { name, fn } of providers) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Redact any credential traces in error messages
      const safeMsg = msg.replace(/key=[^&\s]+/gi, 'key=[REDACTED]');
      logger.warn(`LLM provider '${name}' failed, attempting fallback`, { error: safeMsg });
      errors.push(`${name}: ${safeMsg}`);
    }
  }

  throw new Error(`All LLM providers failed:\n${errors.join('\n')}`);
}

/** Generate embeddings — Gemini primary, returns float[] */
export async function generateEmbedding(text: string): Promise<{ embedding: number[]; model: string }> {
  try {
    const key = await getProviderKey('gemini');
    const model = 'text-embedding-004';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`;
    const { default: nodeFetch } = await import('node-fetch');

    const resp = await nodeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text }] } }),
    });

    if (!resp.ok) throw new Error(`Gemini embeddings error: ${resp.status}`);
    const data = (await resp.json()) as { embedding: { values: number[] } };
    return { embedding: data.embedding.values, model };
  } catch (err) {
    logger.warn('Embedding generation failed', { err });
    throw err;
  }
}
