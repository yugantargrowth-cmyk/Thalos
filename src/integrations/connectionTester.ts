import { decryptCredential } from '../lib/vault.js';
import { config } from '../lib/config.js';

interface IntegrationRow {
  integration_id: string;
  status: string;
  metadata: Record<string, unknown>;
}

export interface TestResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  detail?: string;
}

export async function testIntegrationConnection(integration: IntegrationRow): Promise<TestResult> {
  const start = Date.now();
  try {
    let key: string | null = null;
    const enc = (integration.metadata as Record<string, string>)?._enc;
    if (enc) {
      key = decryptCredential(enc);
    } else {
      const settingsKey = (config.integrations as Record<string, any>)?.[integration.integration_id]?.apiKey;
      if (settingsKey && typeof settingsKey === 'string' && settingsKey.trim()) {
        key = settingsKey.trim();
      }
    }

    if (!key && integration.integration_id !== 'searxng') {
      throw new Error('No credential configured in settings.json or database');
    }

    const result = await runTest(integration.integration_id, key || '');
    return { ...result, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function runTest(integrationId: string, key: string): Promise<Omit<TestResult, 'latencyMs'>> {
  const { default: nodeFetch } = await import('node-fetch');

  switch (integrationId) {
    case 'groq': {
      const resp = await nodeFetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error(`Groq API returned ${resp.status}`);
      const data = (await resp.json()) as { data: unknown[] };
      return { success: true, detail: `${data.data?.length ?? 0} models available` };
    }

    case 'gemini': {
      const resp = await nodeFetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) throw new Error(`Gemini API returned ${resp.status}`);
      const data = (await resp.json()) as { models: unknown[] };
      return { success: true, detail: `${data.models?.length ?? 0} models available` };
    }

    case 'tavily': {
      const resp = await nodeFetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, query: 'test', max_results: 1 }),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error(`Tavily API returned ${resp.status}`);
      return { success: true, detail: 'Tavily search API reachable' };
    }

    case 'resend': {
      const resp = await nodeFetch('https://api.resend.com/domains', {
        headers: { 'Authorization': `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error(`Resend API returned ${resp.status}`);
      return { success: true, detail: 'Resend API reachable' };
    }

    case 'searxng': {
      // SearXNG test uses base URL from config, not the key
      const { config } = await import('../lib/config.js');
      if (!config.searxng.baseUrl) throw new Error('SEARXNG_BASE_URL not set in environment');
      const resp = await nodeFetch(`${config.searxng.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(5000),
      });
      return { success: resp.ok, detail: `SearXNG health check: ${resp.status}` };
    }

    case 'openai': {
      const resp = await nodeFetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error(`OpenAI API returned ${resp.status}`);
      const data = (await resp.json()) as { data: unknown[] };
      return { success: true, detail: `${data.data?.length ?? 0} models available` };
    }

    case 'supabase': {
      const { config } = await import('../lib/config.js');
      if (config.supabase.url.includes('placeholder') || config.supabase.url.includes('your-project')) {
        throw new Error('Supabase URL is still configured with placeholder');
      }
      const resp = await nodeFetch(`${config.supabase.url}/rest/v1/`, {
        headers: {
          apikey: config.supabase.serviceRoleKey || key,
          Authorization: `Bearer ${config.supabase.serviceRoleKey || key}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok && resp.status !== 404) throw new Error(`Supabase returned status ${resp.status}`);
      return { success: true, detail: 'Supabase REST gateway reached' };
    }

    default:
      return { success: false, error: `No test implemented for integration: ${integrationId}` };
  }
}
