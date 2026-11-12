/**
 * LLM Client — provider abstraction
 * ─────────────────────────────────────────────────────────────
 * Priority: Groq (fast) → Gemini (quality/fallback) → Cloudflare (last resort)
 * Keys are NEVER hardcoded. Retrieved from encrypted integration store at call time.
 * Falls back automatically on provider error.
 */

import Groq from 'groq-sdk';
import { getSupabase } from '../lib/supabase.js';
import { decryptCredential } from '../lib/vault.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  tokens_used: number;
  finish_reason?: string;
}

export interface LLMOptions {
  capability?: 'fast' | 'quality'; // fast=groq, quality=gemini
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

type _IntegrationRow = {
  integration_id: string;
  status: string;
  primary_model: string | null;
  fallback_model: string | null;
  base_url: string | null;
  metadata: Record<string, unknown>;
};

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

  if (!data || !['configured','connected','tested','operational'].includes(data.status)) {
    throw new Error(`Integration ${integrationId} is not configured in settings.json or database`);
  }

  const enc = (data.metadata as Record<string, string>)?._enc;
  if (!enc) throw new Error(`No credential found for ${integrationId}`);

  return decryptCredential(enc);
}

/** Call Groq — fastest, free tier available */
async function callGroq(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const key = await getProviderKey('groq');
  const groq = new Groq({ apiKey: key });

  const model = options.capability === 'quality'
    ? 'llama-3.3-70b-versatile'
    : 'llama-3.1-8b-instant';

  const response = await groq.chat.completions.create({
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    max_tokens: options.max_tokens ?? 2048,
    temperature: options.temperature ?? 0.3,
  });

  const choice = response.choices[0];
  return {
    content: choice.message.content ?? '',
    model,
    provider: 'groq',
    tokens_used: response.usage?.total_tokens ?? 0,
    finish_reason: choice.finish_reason ?? undefined,
  };
}

/** Call Gemini via REST — quality model */
async function callGemini(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const key = await getProviderKey('gemini');
  const model = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  // Convert to Gemini format
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemMsg = messages.find(m => m.role === 'system');

  const body = {
    contents,
    ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
    generationConfig: {
      maxOutputTokens: options.max_tokens ?? 2048,
      temperature: options.temperature ?? 0.3,
    },
  };

  const { default: nodeFetch } = await import('node-fetch');
  const resp = await nodeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> }; finishReason: string }>;
    usageMetadata?: { totalTokenCount: number };
  };

  return {
    content: data.candidates[0]?.content.parts[0]?.text ?? '',
    model,
    provider: 'gemini',
    tokens_used: data.usageMetadata?.totalTokenCount ?? 0,
    finish_reason: data.candidates[0]?.finishReason,
  };
}

/** Call Cloudflare Workers AI — last resort */
async function callCloudflare(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const key = await getProviderKey('cloudflare');
  let accountId = (config.integrations as Record<string, any>)?.cloudflare?.accountId;
  if (!accountId) {
    const supabase = getSupabase();
    const { data } = await supabase.from('integrations').select('metadata').eq('integration_id', 'cloudflare').single();
    accountId = (data?.metadata as Record<string, string>)?.account_id;
  }
  if (!accountId) throw new Error('Cloudflare account_id not configured in settings.json or integration metadata');

  const model = '@cf/meta/llama-3.1-8b-instruct';
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const { default: nodeFetch } = await import('node-fetch');
  const resp = await nodeFetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: options.max_tokens ?? 2048 }),
  });

  if (!resp.ok) throw new Error(`Cloudflare AI error: ${resp.status}`);
  const data2 = (await resp.json()) as { result: { response: string } };

  return {
    content: data2.result.response,
    model,
    provider: 'cloudflare',
    tokens_used: 0, // CF does not return token counts on free tier
    finish_reason: 'stop',
  };
}

/**
 * Main LLM call with provider fallback chain.
 * Never throws if at least one provider is available.
 */
export async function llmCall(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
  const providers: Array<() => Promise<LLMResponse>> = [];

  // Determine order based on capability preference
  if (options.capability === 'quality') {
    providers.push(() => callGemini(messages, options));
    providers.push(() => callGroq(messages, options));
  } else {
    providers.push(() => callGroq(messages, options));
    providers.push(() => callGemini(messages, options));
  }
  providers.push(() => callCloudflare(messages, options));

  const errors: string[] = [];
  for (const attempt of providers) {
    try {
      return await attempt();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('LLM provider failed, trying next', { error: msg });
      errors.push(msg);
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
