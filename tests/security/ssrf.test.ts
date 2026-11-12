import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

// Mirror of the SSRF guard from websiteAudit.ts — kept in sync manually
const ALLOWED_PROTOCOLS = ['https:', 'http:'];

function isRfc1918_172(h: string): boolean {
  const m = h.match(/^172\.(\d+)\./);
  if (!m) return false;
  const second = parseInt(m[1], 10);
  return second >= 16 && second <= 31;
}

function checkSSRFGuard(url: string): { allowed: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'Invalid URL' };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { allowed: false, reason: `Protocol not allowed: ${parsed.protocol}` };
  }

  const h = parsed.hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h.startsWith('127.') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    isRfc1918_172(h) ||
    h.startsWith('169.254.') ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.startsWith('fc00:') ||
    h.startsWith('fd') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.corp')
  ) {
    return { allowed: false, reason: 'Internal network access is not permitted' };
  }

  return { allowed: true };
}

describe('SSRF protection — website audit tool', () => {
  it('blocks localhost', () => {
    expect(checkSSRFGuard('http://localhost/api/secret').allowed).toBe(false);
  });

  it('blocks 127.0.0.1', () => {
    expect(checkSSRFGuard('http://127.0.0.1:3000').allowed).toBe(false);
  });

  it('blocks internal 10.x.x.x range', () => {
    expect(checkSSRFGuard('http://10.0.0.1/internal').allowed).toBe(false);
  });

  it('blocks 192.168.x.x', () => {
    expect(checkSSRFGuard('http://192.168.1.1').allowed).toBe(false);
  });

  it('blocks 172.16.x.x (original)', () => {
    expect(checkSSRFGuard('http://172.16.0.1').allowed).toBe(false);
  });

  it('blocks 172.17.x.x (Docker default bridge)', () => {
    expect(checkSSRFGuard('http://172.17.0.1').allowed).toBe(false);
  });

  it('blocks 172.20.x.x (middle of 172.16-31 range)', () => {
    expect(checkSSRFGuard('http://172.20.0.1').allowed).toBe(false);
  });

  it('blocks 172.31.x.x (last of 172.16-31 range)', () => {
    expect(checkSSRFGuard('http://172.31.255.255').allowed).toBe(false);
  });

  it('allows 172.32.x.x (just outside RFC1918 range)', () => {
    expect(checkSSRFGuard('http://172.32.0.1').allowed).toBe(true);
  });

  it('blocks link-local 169.254.x.x (AWS metadata)', () => {
    expect(checkSSRFGuard('http://169.254.169.254/latest/meta-data/').allowed).toBe(false);
  });

  it('blocks .local domains', () => {
    expect(checkSSRFGuard('http://supabase.local').allowed).toBe(false);
  });

  it('blocks .internal domains', () => {
    expect(checkSSRFGuard('http://db.internal').allowed).toBe(false);
  });

  it('blocks .corp domains', () => {
    expect(checkSSRFGuard('http://vault.corp').allowed).toBe(false);
  });

  it('blocks file:// protocol', () => {
    expect(checkSSRFGuard('file:///etc/passwd').allowed).toBe(false);
  });

  it('blocks ftp:// protocol', () => {
    expect(checkSSRFGuard('ftp://example.com/file').allowed).toBe(false);
  });

  it('allows legitimate external HTTPS', () => {
    expect(checkSSRFGuard('https://www.example.com').allowed).toBe(true);
  });

  it('allows HTTP for external sites', () => {
    expect(checkSSRFGuard('http://example.com').allowed).toBe(true);
  });

  it('rejects malformed URL', () => {
    expect(checkSSRFGuard('not-a-url').allowed).toBe(false);
  });
});

describe('Approval payload integrity', () => {
  it('detects tampered payload via hash mismatch', () => {
    const original = { tool_id: 'send_email', inputs: { to: 'client@example.com' } };
    const hash = createHash('sha256').update(JSON.stringify(original)).digest('hex');

    const tampered = { tool_id: 'send_email', inputs: { to: 'attacker@evil.com' } };
    const tamperedHash = createHash('sha256').update(JSON.stringify(tampered)).digest('hex');

    expect(hash).not.toBe(tamperedHash);
  });

  it('same payload always produces same hash', () => {
    const payload = { tool_id: 'draft_email', inputs: { subject: 'Hello' } };
    const h1 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const h2 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    expect(h1).toBe(h2);
  });
});
