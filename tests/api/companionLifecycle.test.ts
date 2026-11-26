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
vi.mock('../../src/intelligence/orchestrator.js', async () => {
  const actual = await vi.importActual('../../src/intelligence/orchestrator.js') as any;
  return {
    ...actual,
    thalosOrchestrate: (...args: any[]) => mockThalosOrchestrate(...args),
  };
});

describe('Mission 2: Companion Lifecycle & Context Understanding', () => {
  const app = createApp();
  const token = issueToken();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assigns durable conversation_id, message_id, and user_message_id as UUIDs', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    });

    mockThalosOrchestrate.mockResolvedValueOnce({
      response: 'Hello Shlok, I am ready to assist.',
      intent: 'general_question',
      action_status: 'none',
      actions_taken: [],
      pending_approvals: [],
      tokens_used: 45,
      model_used: 'groq/llama-3.3-70b-versatile',
    });

    const res = await request(app)
      .post('/api/intelligence/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Good morning THALOS', session_date: '2026-11-20' });

    expect(res.status).toBe(200);
    expect(res.body.conversation_id).toMatch(uuidRegex);
    expect(res.body.message_id).toMatch(uuidRegex);
    expect(res.body.user_message_id).toMatch(uuidRegex);
    expect(res.body.message_id).not.toBe(res.body.user_message_id);
    expect(res.body.action_status).toBe('none');
    expect(res.body.response).toContain('ready to assist');
  });

  it('preserves multi-turn context across consecutive requests in the same session', async () => {
    let storedMessages: any[] = [];

    mockSupabase.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { id: 'conv-session-1', session_date: '2026-11-21', messages: storedMessages, token_count: 0 },
            error: null,
          }),
        }),
      }),
      upsert: ({ messages }: any) => {
        storedMessages = messages;
        return Promise.resolve({ data: null, error: null });
      },
    }));

    // Turn 1
    mockThalosOrchestrate.mockImplementationOnce(async ({ history }) => {
      expect(history.length).toBe(1);
      expect(history[0].content).toBe('Let us evaluate Acme Corp as an outbound prospect.');
      return {
        response: 'Acme Corp is a Series A logistics SaaS with 45 employees.',
        intent: 'research',
        action_status: 'completed',
        actions_taken: ['done:research_prospect'],
        pending_approvals: [],
        tokens_used: 120,
        model_used: 'gemini/gemini-2.5-flash',
      };
    });

    const turn1 = await request(app)
      .post('/api/intelligence/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Let us evaluate Acme Corp as an outbound prospect.', session_date: '2026-11-21' });

    expect(turn1.status).toBe(200);
    expect(turn1.body.action_status).toBe('completed');
    expect(storedMessages.length).toBe(2);

    // Turn 2: Follow-up using pronoun "their"
    mockThalosOrchestrate.mockImplementationOnce(async ({ history }) => {
      // Must contain previous turn user message, assistant response, and current user message
      expect(history.length).toBe(3);
      expect(history[0].content).toContain('Acme Corp');
      expect(history[1].content).toContain('Series A logistics SaaS');
      expect(history[2].content).toContain('What is their estimated headcount growth?');
      return {
        response: 'Based on LinkedIn data, Acme Corp grew headcount by 22% over the last 6 months.',
        intent: 'research',
        action_status: 'completed',
        actions_taken: ['done:research_prospect'],
        pending_approvals: [],
        tokens_used: 95,
        model_used: 'gemini/gemini-2.5-flash',
      };
    });

    const turn2 = await request(app)
      .post('/api/intelligence/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'What is their estimated headcount growth?', session_date: '2026-11-21' });

    expect(turn2.status).toBe(200);
    expect(turn2.body.response).toContain('22% over the last 6 months');
    expect(storedMessages.length).toBe(4);
  });

  it('truthfully assigns pending_approval status when tools require founder signoff', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    });

    mockThalosOrchestrate.mockResolvedValueOnce({
      response: "I have prepared the cold email for Apex Retail. I've queued this for your approval.",
      intent: 'outreach',
      action_status: 'pending_approval',
      actions_taken: ['queued:draft_email'],
      pending_approvals: ['appr_draft_email_apex_01'],
      tokens_used: 110,
      model_used: 'groq/llama-3.3-70b-versatile',
    });

    const res = await request(app)
      .post('/api/intelligence/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Draft an outreach email to Apex Retail', session_date: '2026-11-22' });

    expect(res.status).toBe(200);
    expect(res.body.action_status).toBe('pending_approval');
    expect(res.body.pending_approvals).toEqual(['appr_draft_email_apex_01']);
    expect(res.body.actions_taken).toEqual(['queued:draft_email']);
  });

  it('truthfully assigns clarification_needed when essential parameters are absent', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    });

    mockThalosOrchestrate.mockResolvedValueOnce({
      response: 'Could you specify the client name and the invoice amount so I can draft this accurately?',
      intent: 'clarification_needed',
      action_status: 'clarification_needed',
      actions_taken: [],
      pending_approvals: [],
      tokens_used: 10,
      model_used: 'thalos/clarification_guard',
    });

    const res = await request(app)
      .post('/api/intelligence/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Draft an invoice', session_date: '2026-11-23' });

    expect(res.status).toBe(200);
    expect(res.body.action_status).toBe('clarification_needed');
    expect(res.body.response).toContain('client name and the invoice amount');
  });

  it('handles provider unconfigured/offline error gracefully without crashing session', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    });

    mockThalosOrchestrate.mockRejectedValueOnce(new Error('All LLM providers failed: Groq key not configured'));

    const res = await request(app)
      .post('/api/intelligence/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Analyze Q3 pipeline', session_date: '2026-11-24' });

    expect(res.status).toBe(200);
    expect(res.body.intent).toBe('configuration_needed');
    expect(res.body.response).toContain('Execution & Settings → Integrations');
    expect(res.body.action_status).toBe('none');
  });

  it('allows clearing conversation history via DELETE /api/intelligence/conversations/:date', async () => {
    mockSupabase.from.mockReturnValue({
      delete: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
    });

    const res = await request(app)
      .delete('/api/intelligence/conversations/2026-11-25')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('2026-11-25 cleared');
  });
});
