
import * as safeFetchModule from '../../lib/safeFetch.js';
import { sanitizeExternalText } from '../../lib/externalContentGuard.js';

export async function execute(inputs: Record<string, unknown>): Promise<{
  output: unknown; evidence: string;
}> {
  const url = inputs.url as string;
  if (!url?.trim()) throw new Error('URL is required');

  const check = safeFetchModule.validateUrl(url);
  if (!check.allowed) {
    throw new Error(check.reason ?? 'Internal network access is not permitted');
  }

  try {
    const start = Date.now();
    const resp = await safeFetchModule.safeFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'THALOS-Research/1.0 (Yugantar Growth)' },
      timeoutMs: 15000,
      maxRedirects: 5,
    });

    const latencyMs = Date.now() - start;
    const contentType = resp.headers.get('content-type') ?? '';
    const isHtml = contentType.includes('text/html');

    let textContent = '';
    let title = '';
    let description = '';

    if (isHtml && resp.ok) {
      const html = await resp.text();
      // Basic metadata extraction — no Lighthouse, no JS execution
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
      title = titleMatch?.[1]?.trim() ?? '';
      description = descMatch?.[1]?.trim() ?? '';

      // Extract visible text (stripped HTML) — first 2000 chars and sanitized against prompt injections
      const rawText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000);
      textContent = sanitizeExternalText(rawText);
    }

    const output = {
      url,
      status: resp.status,
      ok: resp.ok,
      content_type: contentType,
      latency_ms: latencyMs,
      title,
      description,
      text_preview: textContent,
      final_url: resp.url,
      note: 'HTTP check only. Does not run Lighthouse or JavaScript analysis.',
    };

    return {
      output,
      evidence: `Website ${url} responded HTTP ${resp.status} in ${latencyMs}ms at ${new Date().toISOString()}`,
    };
  } catch (err) {
    throw new Error(`Website fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
