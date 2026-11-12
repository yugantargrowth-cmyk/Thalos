
// Allowlist of protocols — prevents SSRF to internal networks
const ALLOWED_PROTOCOLS = ['https:', 'http:'];

export async function execute(inputs: Record<string, unknown>): Promise<{
  output: unknown; evidence: string;
}> {
  const url = inputs.url as string;
  if (!url?.trim()) throw new Error('URL is required');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw new Error(`Protocol not allowed: ${parsed.protocol}`);
  }

  // Block internal/private IP ranges — RFC 1918 + loopback + link-local (SSRF protection)
  const hostname = parsed.hostname.toLowerCase();

  // Check 172.16.0.0/12 range (172.16.x.x – 172.31.x.x)
  function isRfc1918_172(h: string): boolean {
    const m = h.match(/^172\.(\d+)\./);
    if (!m) return false;
    const second = parseInt(m[1], 10);
    return second >= 16 && second <= 31;
  }

  if (
    hostname === 'localhost' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    isRfc1918_172(hostname) ||
    hostname.startsWith('169.254.') ||  // link-local
    hostname === '0.0.0.0' ||
    hostname === '::1' ||               // IPv6 loopback
    hostname.startsWith('fc00:') ||     // IPv6 ULA
    hostname.startsWith('fd') ||        // IPv6 ULA fd00::/8
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.corp')
  ) {
    throw new Error('Internal network access is not permitted');
  }

  const { default: nodeFetch } = await import('node-fetch');
  try {
    const start = Date.now();
    const resp = await nodeFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'THALOS-Research/1.0 (Yugantar Growth)' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
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

      // Extract visible text (stripped HTML) — first 2000 chars
      textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000);
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
