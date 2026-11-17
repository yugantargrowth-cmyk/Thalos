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

const { mockAgentService } = vi.hoisted(() => ({
  mockAgentService: {
    updateAgent: vi.fn(),
    delegateTask: vi.fn(),
  },
}));

vi.mock('../../src/intelligence/agentService.js', () => ({
  agentService: mockAgentService,
  CANONICAL_AGENTS: ['thalos', 'scout', 'hunter', 'closer', 'operator', 'spark', 'publisher', 'analyst', 'researcher'],
}));

describe('Agents API Endpoints (L10-AC-01, L10-AC-02, L10-AC-03, L10-AC-05)', () => {
  const app = createApp();
  const token = issueToken();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/system/agents returns list of agents (L10-AC-01)', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        order: () => Promise.resolve({
          data: [
            { agent_id: 'thalos', display_name: 'THALOS' },
            { agent_id: 'scout', display_name: 'Scout' },
          ],
          error: null,
        }),
      }),
    });

    const res = await request(app)
      .get('/api/system/agents')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.agents).toBeDefined();
    expect(res.body.agents.length).toBe(2);
  });

  it('GET /api/system/agents/:agentId returns single agent or 404', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { agent_id: 'scout', display_name: 'Scout' },
            error: null,
          }),
        }),
      }),
    });

    const res = await request(app)
      .get('/api/system/agents/scout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.agent.agent_id).toBe('scout');

    // 404 test
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'Not found' } }),
        }),
      }),
    });

    const notFoundRes = await request(app)
      .get('/api/system/agents/unknown_agent')
      .set('Authorization', `Bearer ${token}`);

    expect(notFoundRes.status).toBe(404);
  });

  it('PATCH /api/system/agents/:agentId updates agent configuration (L10-AC-02, L10-AC-03)', async () => {
    mockAgentService.updateAgent.mockResolvedValueOnce({
      agent_id: 'scout',
      display_name: 'Scout Updated',
      model_capability: 'quality',
    });

    const res = await request(app)
      .patch('/api/system/agents/scout')
      .set('Authorization', `Bearer ${token}`)
      .send({ display_name: 'Scout Updated', model_capability: 'quality' });

    expect(res.status).toBe(200);
    expect(res.body.agent.display_name).toBe('Scout Updated');
    expect(mockAgentService.updateAgent).toHaveBeenCalledWith('scout', expect.anything(), 'owner');
  });

  it('POST /api/system/agents/:agentId/delegate executes delegation contract (L10-AC-05)', async () => {
    mockAgentService.delegateTask.mockResolvedValueOnce({
      delegation_id: 'del-uuid-123',
      from_agent: 'thalos',
      to_agent: 'scout',
      status: 'completed',
      output: { leads: 5 },
      provenance: {
        agent_id: 'scout',
        model_used: 'groq/llama-3.3-70b-versatile',
        tokens_used: 120,
        duration_ms: 450,
        tools_executed: ['web_search'],
      },
    });

    const res = await request(app)
      .post('/api/system/agents/scout/delegate')
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'test-trace-del-route')
      .send({
        from_agent: 'thalos',
        task_type: 'lead_discovery',
        input: { query: 'Dentists' },
      });

    expect(res.status).toBe(200);
    expect(res.body.delegation.delegation_id).toBe('del-uuid-123');
    expect(res.body.delegation.provenance.agent_id).toBe('scout');
  });
});
