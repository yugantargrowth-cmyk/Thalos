import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/api/app.js';
import { issueToken } from '../../src/api/middleware/auth.js';

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

const mockThalosOrchestrate = vi.fn();
vi.mock('../../src/intelligence/orchestrator.js', () => ({
  thalosOrchestrate: (...args: any[]) => mockThalosOrchestrate(...args),
}));

const mockGenerateDailyBrief = vi.fn();
vi.mock('../../src/intelligence/brief.js', () => ({
  generateDailyBrief: (...args: any[]) => mockGenerateDailyBrief(...args),
}));

describe('Intelligence API Routes (L09-AC-08)', () => {
  const app = createApp();
  const token = issueToken();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/api/intelligence/chat')
      .send({ message: 'Hello' });

    expect(res.status).toBe(401);
  });

  it('rejects empty message with 400', async () => {
    const res = await request(app)
      .post('/api/intelligence/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('processes chat message, runs orchestrator, and updates conversation history', async () => {
    // 1. Fetch conversation
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { id: 'conv-1', session_date: '2026-11-18', messages: [], token_count: 0 },
            error: null,
          }),
        }),
      }),
    });

    // Mock orchestrator
    mockThalosOrchestrate.mockResolvedValueOnce({
      response: 'Found 3 leads for you.',
      intent: 'lead_discovery',
      actions_taken: ['done:web_search'],
      pending_approvals: [],
      tokens_used: 120,
      model_used: 'groq/llama-3.3-70b-versatile',
    });

    // 2. Update conversation
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
    });

    const res = await request(app)
      .post('/api/intelligence/chat')
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'test-trace-chat-999')
      .send({ message: 'Find me leads', session_date: '2026-11-18' });

    expect(res.status).toBe(200);
    expect(res.body.response).toBe('Found 3 leads for you.');
    expect(res.body.intent).toBe('lead_discovery');
    expect(res.body.actions_taken).toEqual(['done:web_search']);
    expect(res.headers['x-correlation-id']).toBe('test-trace-chat-999');
  });

  it('GET /api/intelligence/brief returns daily brief', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: {
              brief_date: new Date().toISOString().split('T')[0],
              content: '## Good morning, Shlok 👋\nToday focus on closing deals.',
            },
            error: null,
          }),
        }),
      }),
    });

    const res = await request(app)
      .get('/api/intelligence/brief')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.brief.content).toContain('Good morning, Shlok');
  });
});
