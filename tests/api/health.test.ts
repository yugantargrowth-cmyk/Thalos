import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/api/app.js';

describe('API Runtime endpoints, Security Headers, CORS, and Correlation IDs (L14-AC-03, L14-AC-04, L14-AC-05)', () => {
  const app = createApp();

  it('GET /health returns 200 with service info, uptime, and correlation ID', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('thalos-api');
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.headers['x-correlation-id']).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /health/ready returns readiness check results', async () => {
    const res = await request(app).get('/health/ready');
    // In local dev with placeholder supabase, it succeeds with skipped DB or ok vault
    expect([200, 503]).toContain(res.status);
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.vault).toBe('ok');
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  it('preserves existing incoming x-correlation-id in response headers', async () => {
    const customId = 'custom-trace-id-12345';
    const res = await request(app)
      .get('/health')
      .set('x-correlation-id', customId);

    expect(res.status).toBe(200);
    expect(res.headers['x-correlation-id']).toBe(customId);
    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('includes standard security headers from Helmet', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('enforces CORS origin checks', async () => {
    // Disallowed origin
    const disallowedRes = await request(app)
      .get('/health')
      .set('Origin', 'https://malicious-untrusted-site.com');

    expect(disallowedRes.status).toBe(403);
    expect(disallowedRes.body.error).toBe('CORS origin not allowed');

    // Allowed origin
    const allowedRes = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');

    expect(allowedRes.status).toBe(200);
    expect(allowedRes.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('returns 404 with correlation ID for unmapped routes', async () => {
    const res = await request(app).get('/nonexistent-path-abc');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Route not found');
    expect(res.body.correlationId).toBeDefined();
  });

  it('rejects payloads exceeding the 2MB limit with 413 Payload too large', async () => {
    // Generate payload larger than 2MB
    const largeStr = 'a'.repeat(2.5 * 1024 * 1024);
    const res = await request(app)
      .post('/api/auth/pin')
      .send({ pin: largeStr });

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Payload too large');
  });
});
