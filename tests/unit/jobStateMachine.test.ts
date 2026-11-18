/**
 * Mission S06: Nervous System - Job State Machine & Retry Backoff Tests
 * S06-AC-01, S06-AC-02, S06-AC-03, S06-AC-04
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canTransitionJob,
  VALID_JOB_TRANSITIONS,
  computeNextJobStatus,
  classifyJobError,
  PermanentJobError,
  TransientJobError,
  WorkerService,
  JobRow,
} from '../../src/worker/worker.js';

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

describe('Job State Machine & Transitions (S06-AC-01)', () => {
  it('allows valid transitions between job lifecycle states', () => {
    // queued -> claimed
    expect(canTransitionJob('queued', 'claimed')).toBe(true);
    expect(canTransitionJob('queued', 'cancelled')).toBe(true);

    // claimed -> running -> completed
    expect(canTransitionJob('claimed', 'running')).toBe(true);
    expect(canTransitionJob('running', 'completed')).toBe(true);

    // running -> queued (retry wait)
    expect(canTransitionJob('running', 'queued')).toBe(true);

    // running -> failed / dead_letter
    expect(canTransitionJob('running', 'failed')).toBe(true);
    expect(canTransitionJob('running', 'dead_letter')).toBe(true);

    // dead_letter / failed -> queued (manual retry by operator)
    expect(canTransitionJob('dead_letter', 'queued')).toBe(true);
    expect(canTransitionJob('failed', 'queued')).toBe(true);
  });

  it('rejects invalid or illegal transitions', () => {
    // completed is a terminal state (cannot transition)
    expect(canTransitionJob('completed', 'queued')).toBe(false);
    expect(canTransitionJob('completed', 'running')).toBe(false);
    expect(canTransitionJob('completed', 'failed')).toBe(false);

    // queued cannot immediately jump to completed without claim
    expect(canTransitionJob('queued', 'completed')).toBe(false);
    expect(canTransitionJob('queued', 'running')).toBe(false);
  });
});

describe('Error Classification & Bounded Exponential Backoff (S06-AC-03)', () => {
  it('correctly classifies permanent vs transient errors', () => {
    const permErr = new PermanentJobError('Invalid schema format');
    expect(classifyJobError(permErr).isTransient).toBe(false);

    const transErr = new TransientJobError('Rate limit exceeded (HTTP 429)');
    expect(classifyJobError(transErr).isTransient).toBe(true);

    // String heuristic classifications
    expect(classifyJobError(new Error('SyntaxError: unexpected token')).isTransient).toBe(false);
    expect(classifyJobError(new Error('Validation error: field missing')).isTransient).toBe(false);
    expect(classifyJobError(new Error('No handler registered')).isTransient).toBe(false);
    expect(classifyJobError(new Error('Socket timeout after 5000ms')).isTransient).toBe(true);
    expect(classifyJobError(new Error('HTTP 503 Service Unavailable')).isTransient).toBe(true);
  });

  it('computes bounded exponential backoff up to 1-hour cap', () => {
    // Attempt 1: 2^1 * 30s = 60s (60,000ms)
    const res1 = computeNextJobStatus({ attempt: 1, maxAttempts: 5, success: false, isTransient: true });
    expect(res1.willRetry).toBe(true);
    expect(res1.nextStatus).toBe('queued');
    expect(res1.backoffDelayMs).toBe(60000);

    // Attempt 2: 2^2 * 30s = 120s (120,000ms)
    const res2 = computeNextJobStatus({ attempt: 2, maxAttempts: 5, success: false, isTransient: true });
    expect(res2.backoffDelayMs).toBe(120000);

    // Attempt 8: 2^8 * 30,000 = 7,680,000ms -> capped at 3,600,000ms (1 hour)
    const res8 = computeNextJobStatus({ attempt: 8, maxAttempts: 10, success: false, isTransient: true });
    expect(res8.backoffDelayMs).toBe(3600000);
  });

  it('fails immediately without retry for permanent errors', () => {
    const res = computeNextJobStatus({ attempt: 1, maxAttempts: 3, success: false, isTransient: false });
    expect(res.willRetry).toBe(false);
    expect(res.nextStatus).toBe('failed');
    expect(res.isDeadLetter).toBe(false);
  });

  it('transitions to dead_letter when max attempts are reached', () => {
    const res = computeNextJobStatus({ attempt: 3, maxAttempts: 3, success: false, isTransient: true });
    expect(res.willRetry).toBe(false);
    expect(res.nextStatus).toBe('dead_letter');
    expect(res.isDeadLetter).toBe(true);
  });
});

describe('Typed Handlers and Unknown Job Types (S06-AC-04)', () => {
  let worker: WorkerService;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new WorkerService('worker-test-handlers');
  });

  it('allows registering and discovering typed handlers', () => {
    const customHandler = vi.fn().mockResolvedValue(undefined);
    worker.registerHandler('custom_sync', customHandler);

    expect(worker.getRegisteredJobTypes()).toContain('custom_sync');
    expect(worker.getRegisteredJobTypes()).toContain('ingest_document');
    expect(worker.getRegisteredJobTypes()).toContain('import_csv');
  });

  it('fails visibly when processing an unknown job type and never marks it completed', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockSupabase.from.mockReturnValue({
      update: updateMock,
    });

    const unknownJob: JobRow = {
      id: 'job-unknown-99',
      job_type: 'unknown_alien_type',
      payload: {},
      attempt: 1,
      max_attempts: 3,
    };

    await worker.processJob(unknownJob);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('No handler registered for job type: unknown_alien_type'),
      })
    );
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });
});
