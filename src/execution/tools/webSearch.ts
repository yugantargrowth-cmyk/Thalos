/**
 * Web Search Tool
 * Uses SearXNG (self-hosted, primary) → Tavily (fallback)
 * Returns results with source URLs — never fabricates.
 */

import { getSupabase } from '../../lib/supabase.js';
import { decryptCredential } from '../../lib/vault.js';
import { logger } from '../../lib/logger.js';
import { config } from '../../lib/config.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export async function execute(inputs: Record<string, unknown>): Promise<{
  output: { results: SearchResult[]; query: string; source: string };
  evidence: string;
}> {
  const query = inputs.query as string;
  if (!query?.trim()) throw new Error('Search query is required');

  // Try SearXNG first
  if (config.searxng.baseUrl) {
    try {
      const results = await searchSearXNG(query);
      return {
        output: { results, query, source: 'searxng' },
        evidence: `${results.length} results from SearXNG at ${new Date().toISOString()}`,
      };
    } catch (err) {
      logger.warn('SearXNG failed, trying Tavily', { error: err instanceof Error ? err.message : err });
    }
  }

  // Fallback to Tavily
  const results = await searchTavily(query);
  return {
    output: { results, query, source: 'tavily' },
    evidence: `${results.length} results from Tavily at ${new Date().toISOString()}`,
  };
}

async function searchSearXNG(query: string): Promise<SearchResult[]> {
  const url = new URL('/search', config.searxng.baseUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('categories', 'general');

  const { default: nodeFetch } = await import('node-fetch');
  const resp = await nodeFetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) throw new Error(`SearXNG HTTP ${resp.status}`);

  const data = (await resp.json()) as {
    results: Array<{ title: string; url: string; content: string }>;
  };

  return (data.results ?? []).slice(0, 10).map(r => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.content ?? '',
    source: 'searxng',
  }));
}

async function searchTavily(query: string): Promise<SearchResult[]> {
  let apiKey = (config.integrations as Record<string, any>)?.tavily?.apiKey;

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    const supabase = getSupabase();
    const { data: integration } = await supabase
      .from('integrations')
      .select('metadata, status')
      .eq('integration_id', 'tavily')
      .single();

    if (!integration || !['configured','operational'].includes(integration.status)) {
      throw new Error('Tavily not configured. Set Tavily API key in settings.json or Integrations.');
    }

    const enc = (integration.metadata as Record<string, string>)?._enc;
    if (!enc) throw new Error('Tavily credential not found');
    apiKey = decryptCredential(enc);
  }

  const { default: nodeFetch } = await import('node-fetch');
  const resp = await nodeFetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 10 }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(`Tavily HTTP ${resp.status}`);
  const data = (await resp.json()) as { results: Array<{ title: string; url: string; content: string }> };

  return (data.results ?? []).map(r => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.content ?? '',
    source: 'tavily',
  }));
}
