/**
 * Web Search Tool (S03-AC-01, S03-AC-02)
 * Uses SearXNG (self-hosted, primary) → Tavily (fallback)
 * Returns normalized results with title, URL, snippet, source and retrieval timestamp.
 * Results are explicitly distinguishable from verified facts.
 */

import { getSupabase } from '../../lib/supabase.js';
import { decryptCredential } from '../../lib/vault.js';
import { logger } from '../../lib/logger.js';
import { config } from '../../lib/config.js';
import { sanitizeExternalText } from '../../lib/externalContentGuard.js';

import * as safeFetchModule from '../../lib/safeFetch.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  retrieved_at: string;
  citation: string;
}

export function formatWebCitation(title: string, url: string): string {
  return `[Web: ${title || 'Untitled'} (${url || 'No URL'})]`;
}

export async function execute(inputs: Record<string, unknown>): Promise<{
  output: { results: SearchResult[]; query: string; source: string; retrieved_at: string };
  evidence: string;
}> {
  const query = inputs.query as string;
  if (!query?.trim()) throw new Error('Search query is required');

  const now = new Date().toISOString();

  // Try SearXNG first
  if (config.searxng.baseUrl) {
    try {
      const results = await searchSearXNG(query);
      return {
        output: { results, query, source: 'searxng', retrieved_at: now },
        evidence: `${results.length} normalized results from SearXNG at ${now}`,
      };
    } catch (err) {
      logger.warn('SearXNG failed, trying Tavily', { error: err instanceof Error ? err.message : err });
    }
  }

  // Fallback to Tavily
  const results = await searchTavily(query);
  return {
    output: { results, query, source: 'tavily', retrieved_at: now },
    evidence: `${results.length} normalized results from Tavily at ${now}`,
  };
}

async function searchSearXNG(query: string): Promise<SearchResult[]> {
  const url = new URL('/search', config.searxng.baseUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('categories', 'general');

  const resp = await safeFetchModule.safeFetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    timeoutMs: 10000,
  });

  if (!resp.ok) throw new Error(`SearXNG HTTP ${resp.status}`);

  const data = (await resp.json()) as {
    results: Array<{ title: string; url: string; content: string }>;
  };

  const now = new Date().toISOString();
  return (data.results ?? []).slice(0, 10).map((r) => {
    const title = r.title ?? '';
    const linkUrl = r.url ?? '';
    return {
      title,
      url: linkUrl,
      snippet: sanitizeExternalText(r.content ?? ''),
      source: 'searxng',
      retrieved_at: now,
      citation: formatWebCitation(title, linkUrl),
    };
  });
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

  const resp = await safeFetchModule.safeFetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 10 }),
    timeoutMs: 15000,
  });

  if (!resp.ok) throw new Error(`Tavily HTTP ${resp.status}`);
  const data = (await resp.json()) as { results: Array<{ title: string; url: string; content: string }> };

  const now = new Date().toISOString();
  return (data.results ?? []).map((r) => {
    const title = r.title ?? '';
    const linkUrl = r.url ?? '';
    return {
      title,
      url: linkUrl,
      snippet: sanitizeExternalText(r.content ?? ''),
      source: 'tavily',
      retrieved_at: now,
      citation: formatWebCitation(title, linkUrl),
    };
  });
}
