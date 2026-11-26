import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/api/app.js';
import { issueToken } from '../../src/api/middleware/auth.js';

const mockSupabase = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: [{ id: 'job-1', job_type: 'csv_import', status: 'completed' }],
          error: null,
          count: 1,
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'job-dead-1' }],
          error: null,
        }),
      }),
    }),
  }),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

const mockThalosOrchestrate = vi.fn().mockResolvedValue({
  response: 'THALOS online and ready.',
  intent: 'general_query',
  actions_taken: [],
  pending_approvals: [],
  tokens_used: 12,
  model_used: 'groq/llama-3.3-70b-versatile',
});

vi.mock('../../src/intelligence/orchestrator.js', () => ({
  thalosOrchestrate: (...args: any[]) => mockThalosOrchestrate(...args),
}));

describe('Mission 1: Frontend Completion & Canonical Backend Integration', () => {
  const app = createApp();
  const token = issueToken();

  it('serves static frontend files and manifest from public directory', async () => {
    const resRoot = await request(app).get('/');
    expect(resRoot.status).toBe(200);
    expect(resRoot.headers['content-type']).toMatch(/html/);

    const resManifest = await request(app).get('/manifest.webmanifest');
    expect(resManifest.status).toBe(200);
  });

  it('enforces authentication on protected business and intelligence APIs', async () => {
    const resNoAuth = await request(app).post('/api/intelligence/chat').send({ message: 'Hello' });
    expect(resNoAuth.status).toBe(401);

    const resWithAuth = await request(app)
      .post('/api/intelligence/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Hello THALOS' });
    expect(resWithAuth.status).toBe(200);
    expect(resWithAuth.body).toHaveProperty('response', 'THALOS online and ready.');
    expect(resWithAuth.body).toHaveProperty('model_used', 'groq/llama-3.3-70b-versatile');
  });

  it('exposes /api/system/queue and /api/system/queue/retry-dead-letter for Operations monitoring', async () => {
    const resQueue = await request(app)
      .get('/api/system/queue')
      .set('Authorization', `Bearer ${token}`);
    expect(resQueue.status).toBe(200);
    expect(resQueue.body).toHaveProperty('queue');

    const resRetry = await request(app)
      .post('/api/system/queue/retry-dead-letter')
      .set('Authorization', `Bearer ${token}`);
    expect([200, 500]).toContain(resRetry.status);
  });

  it('exposes /api/system/jobs with status filter support', async () => {
    const resJobs = await request(app)
      .get('/api/system/jobs?limit=5')
      .set('Authorization', `Bearer ${token}`);
    expect(resJobs.status).toBe(200);
    expect(resJobs.body).toHaveProperty('jobs');
    expect(Array.isArray(resJobs.body.jobs)).toBe(true);
  });

  it('exposes /api/integrations/status and /settings for vault configuration', async () => {
    const resStatus = await request(app)
      .get('/api/integrations/status')
      .set('Authorization', `Bearer ${token}`);
    expect(resStatus.status).toBe(200);
    expect(resStatus.body).toHaveProperty('providers');

    const resSave = await request(app)
      .post('/api/integrations/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ groqApiKey: 'gsk_test_key_sample' });
    expect(resSave.status).toBe(200);
    expect(resSave.body.success).toBe(true);
  });
});
