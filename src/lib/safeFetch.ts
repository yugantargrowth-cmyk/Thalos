/**
 * THALOS Safe Fetch & SSRF Protection Guard (S03-AC-08)
 * ─────────────────────────────────────────────────────────────
 * Canonical outbound HTTP fetcher protecting against:
 * - SSRF into internal networks (RFC 1918, link-local, loopback, IPv6 ULA)
 * - Cloud metadata endpoints (169.254.169.254, metadata.google.internal)
 * - Internal hostnames (.local, .internal, .corp, .lan, localhost)
 * - Unsafe protocols (blocks file://, ftp://, gopher://, etc.)
 * - Open redirect chains leading to internal destinations
 * - Response content-size exhaustion (DoS)
 * - Unbounded network timeouts
 */

import nodeFetch, { type Response as FetchResponse, type RequestInit } from 'node-fetch';

const ALLOWED_PROTOCOLS = ['https:', 'http:'];
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BODY_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Check if an IPv4 address is in the RFC 1918 172.16.0.0/12 range (172.16.x.x - 172.31.x.x).
 */
export function isRfc1918_172(hostname: string): boolean {
  const match = hostname.match(/^172\.(\d+)\./);
  if (!match) return false;
  const secondOctet = parseInt(match[1], 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

/**
 * Validate a target URL against SSRF rules.
 */
export function validateUrl(url: string): { allowed: boolean; reason?: string; parsed?: URL } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'Invalid URL' };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { allowed: false, reason: `Protocol not allowed: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost, loopbacks, private networks, cloud metadata
  if (
    hostname === 'localhost' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    isRfc1918_172(hostname) ||
    hostname.startsWith('169.254.') || // Link-local / AWS / GCP / Azure metadata
    hostname === '0.0.0.0' ||
    hostname === '::1' || // IPv6 loopback
    hostname.startsWith('fc00:') || // IPv6 ULA
    hostname.startsWith('fd') || // IPv6 ULA fd00::/8
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.corp') ||
    hostname.endsWith('.lan')
  ) {
    return { allowed: false, reason: 'Internal network access is not permitted' };
  }

  return { allowed: true, parsed };
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxRedirects?: number;
  maxSizeBytes?: number;
  fetcher?: typeof nodeFetch;
}

/**
 * Perform an HTTP request with SSRF, redirect, timeout, and response size protections.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<FetchResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_BODY_SIZE_BYTES;
  const fetchImpl = options.fetcher ?? nodeFetch;

  let currentUrl = url;
  let redirectsFollowed = 0;

  while (redirectsFollowed <= maxRedirects) {
    // 1. SSRF check before every request (including redirects)
    const check = validateUrl(currentUrl);
    if (!check.allowed || !check.parsed) {
      throw new Error(`SSRF blocked: ${check.reason ?? 'Destination not permitted'}`);
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Execute request with manual redirect handling to inspect location
      const fetchOpts: RequestInit = {
        ...options,
        redirect: 'manual',
        signal: controller.signal,
      };

      const response = await fetchImpl(currentUrl, fetchOpts);
      clearTimeout(timeoutTimer);

      // 2. Check for redirect responses (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return response;
        }

        redirectsFollowed++;
        if (redirectsFollowed > maxRedirects) {
          throw new Error(`Maximum redirects (${maxRedirects}) exceeded`);
        }

        // Resolve relative redirects against current URL
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      // 3. Check response size header if available
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
        throw new Error(`Response size (${contentLength} bytes) exceeds limit of ${maxSizeBytes} bytes`);
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutTimer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  throw new Error(`Maximum redirects (${maxRedirects}) exceeded`);
}
