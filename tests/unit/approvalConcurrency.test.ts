import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/api/app.js';
import { issueToken } from '../../src/api/middleware/auth.js';

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock('../../src/execution/approvalExecutor.js', () => ({
  executeApprovedAction: vi.fn().mockResolvedValue({
    success: true,
    summary: 'send_email completed successfully',
    evidence: 'msg_123',
  }),
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

describe('Approval Concurrency & State Machine (L11-AC-04, R-002)', () => {
  const app = createApp();
  const token = issueToken();
  const approvalId = 'beb0b2f1-4b32-4f92-9476-a33a95cef62b';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function hashPayload(payload: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  it('approves a pending approval with atomic single-use update (L11-AC-04)', async () => {
    const payload = { tool_id: 'send_email', inputs: { to: 'test@example.com' } };
    const payloadHash = hashPayload(payload);

    const pendingRecord = {
      id: approvalId,
      status: 'pending',
      action: 'Send Email',
      agent: 'hunter',
      payload,
      payload_hash: payloadHash,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };

    // 1. Initial query check
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: pendingRecord, error: null }),
          }),
        }),
      }),
    });

    // 2. Atomic update: .update().eq('id', ...).eq('status', 'pending').select().maybeSingle()
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () => Promise.resolve({
                data: { ...pendingRecord, status: 'approved' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    // 3. Final update after execution
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
    });

    const res = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ execute_immediately: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  it('rejects concurrent duplicate approval with 409 Conflict (R-002)', async () => {
    const payload = { tool_id: 'send_email', inputs: { to: 'test@example.com' } };
    const payloadHash = hashPayload(payload);

    const pendingRecord = {
      id: approvalId,
      status: 'pending',
      action: 'Send Email',
      agent: 'hunter',
      payload,
      payload_hash: payloadHash,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };

    // 1. First fetch finds it pending
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: pendingRecord, error: null }),
          }),
        }),
      }),
    });

    // 2. But atomic update finds status is no longer pending (lost race condition)
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });

    const res = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ execute_immediately: true });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Approval is no longer pending or was processed concurrently');
  });

  it('rejects tampered approval payload with 409 Conflict', async () => {
    const originalPayload = { tool_id: 'send_email', inputs: { to: 'test@example.com' } };
    const tamperedPayload = { tool_id: 'send_email', inputs: { to: 'attacker@example.com' } };

    const tamperedRecord = {
      id: approvalId,
      status: 'pending',
      action: 'Send Email',
      agent: 'hunter',
      payload: tamperedPayload,
      payload_hash: hashPayload(originalPayload), // hash does not match tampered payload
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };

    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: tamperedRecord, error: null }),
          }),
        }),
      }),
    });

    const res = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ execute_immediately: true });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('payload has been tampered with');
  });

  it('rejects expired approval with 410 Gone', async () => {
    const payload = { tool_id: 'send_email', inputs: { to: 'test@example.com' } };
    const expiredRecord = {
      id: approvalId,
      status: 'pending',
      action: 'Send Email',
      agent: 'hunter',
      payload,
      payload_hash: hashPayload(payload),
      expires_at: new Date(Date.now() - 3600000).toISOString(), // expired 1 hr ago
    };

    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: expiredRecord, error: null }),
          }),
        }),
      }),
    });

    // Mock update to expired
    mockSupabase.from.mockReturnValueOnce({
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
    });

    const res = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ execute_immediately: true });

    expect(res.status).toBe(410);
    expect(res.body.error).toContain('Approval has expired');
  });
});
