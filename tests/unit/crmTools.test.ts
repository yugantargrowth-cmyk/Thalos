/**
 * Unit tests for CRM tool handlers.
 * Uses vi.mock to stub Supabase — no live DB required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase ─────────────────────────────────────────────
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => ({
    from: () => ({
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
    }),
  }),
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path chain: insert().select().single() → { data, error }
  mockSingle.mockResolvedValue({ data: { id: 'test-uuid', name: 'Test Business', phone: '+919876543210', stage: 'new', monthly_value: 5000, status: 'onboarding' }, error: null });
  mockSelect.mockReturnValue({ single: mockSingle });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockEq.mockReturnValue({ select: mockSelect, single: mockSingle });
  mockUpdate.mockReturnValue({ eq: mockEq });
});

import {
  executeCreateLead,
  executeUpdateLead,
  executeLogLeadActivity,
  executeScheduleFollowUp,
  executeCreateClient,
  executeCreateTask,
  executeUpdateTask,
} from '../../src/execution/tools/crmTools.js';

// ── create_lead ───────────────────────────────────────────────
describe('executeCreateLead', () => {
  it('creates a lead with required fields', async () => {
    const result = await executeCreateLead({ name: 'Test Business', phone: '+919876543210' });
    expect(result.output).toMatchObject({ id: 'test-uuid', name: 'Test Business' });
    expect(result.evidence).toContain('created');
  });

  it('throws when name is missing', async () => {
    await expect(executeCreateLead({ phone: '+919876543210' })).rejects.toThrow('name');
  });

  it('throws when phone is missing', async () => {
    await expect(executeCreateLead({ name: 'Test' })).rejects.toThrow('phone');
  });

  it('throws on invalid stage', async () => {
    await expect(executeCreateLead({ name: 'T', phone: '+91123', stage: 'invalid_stage' }))
      .rejects.toThrow('Invalid stage');
  });

  it('accepts valid stage', async () => {
    const result = await executeCreateLead({ name: 'T', phone: '+91123', stage: 'qualified' });
    expect(result.output).toBeDefined();
  });

  it('propagates DB error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'unique constraint' } });
    await expect(executeCreateLead({ name: 'T', phone: '+91123' }))
      .rejects.toThrow('create_lead failed');
  });
});

// ── update_lead ───────────────────────────────────────────────
describe('executeUpdateLead', () => {
  it('updates a lead by id', async () => {
    // update().eq().select().single()
    const selectSingle = { single: mockSingle };
    const eqResult = { select: () => selectSingle };
    mockUpdate.mockReturnValue({ eq: () => eqResult });

    const result = await executeUpdateLead({ lead_id: 'test-uuid', stage: 'qualified' });
    expect(result.output).toBeDefined();
    expect(result.evidence).toContain('updated');
  });

  it('throws when lead_id is missing', async () => {
    await expect(executeUpdateLead({ stage: 'qualified' })).rejects.toThrow('lead_id');
  });

  it('throws when no update fields provided', async () => {
    await expect(executeUpdateLead({ lead_id: 'test-uuid' })).rejects.toThrow('No fields');
  });
});

// ── log_lead_activity ─────────────────────────────────────────
describe('executeLogLeadActivity', () => {
  it('logs an activity', async () => {
    const result = await executeLogLeadActivity({
      lead_id: 'test-uuid',
      activity: 'contacted',
      description: 'Sent initial WhatsApp',
    });
    expect(result.evidence).toContain('contacted');
  });

  it('throws when required fields missing', async () => {
    await expect(executeLogLeadActivity({ lead_id: 'test-uuid', activity: 'contacted' }))
      .rejects.toThrow('description');
  });
});

// ── schedule_follow_up ────────────────────────────────────────
describe('executeScheduleFollowUp', () => {
  it('schedules a follow-up', async () => {
    const result = await executeScheduleFollowUp({
      entity_type: 'lead',
      entity_id: 'test-uuid',
      due_date: '2026-12-01',
      reminder_note: 'Call back',
    });
    expect(result.evidence).toContain('Follow-up scheduled');
  });

  it('throws when due_date missing', async () => {
    await expect(executeScheduleFollowUp({ entity_type: 'lead', entity_id: 'x', reminder_note: 'y' }))
      .rejects.toThrow('due_date');
  });
});

// ── create_client ─────────────────────────────────────────────
describe('executeCreateClient', () => {
  it('creates a client', async () => {
    const result = await executeCreateClient({
      business_name: 'Acme Corp',
      contact_name: 'Rahul',
      phone: '+919876543210',
      start_date: '2026-11-01',
      monthly_value: 5000,
    });
    expect(result.evidence).toContain('created');
  });

  it('throws on negative monthly_value', async () => {
    await expect(executeCreateClient({
      business_name: 'X', contact_name: 'Y', phone: '+91123',
      start_date: '2026-01-01', monthly_value: -1,
    })).rejects.toThrow('non-negative');
  });

  it('throws on invalid status', async () => {
    await expect(executeCreateClient({
      business_name: 'X', contact_name: 'Y', phone: '+91123',
      start_date: '2026-01-01', status: 'invalid',
    })).rejects.toThrow('Invalid status');
  });
});

// ── create_task ───────────────────────────────────────────────
describe('executeCreateTask', () => {
  it('creates a task with defaults', async () => {
    const result = await executeCreateTask({ title: 'Follow up with lead' });
    expect(result.output).toBeDefined();
    expect(result.evidence).toContain('created');
  });

  it('throws on invalid priority', async () => {
    await expect(executeCreateTask({ title: 'T', priority: 'extreme' }))
      .rejects.toThrow('Invalid priority');
  });
});

// ── update_task ───────────────────────────────────────────────
describe('executeUpdateTask', () => {
  it('throws when no task_id', async () => {
    await expect(executeUpdateTask({ status: 'completed' })).rejects.toThrow('task_id');
  });

  it('throws on invalid status', async () => {
    await expect(executeUpdateTask({ task_id: 'x', status: 'done' }))
      .rejects.toThrow('Invalid status');
  });
});
