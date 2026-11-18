/**
 * Mission S06: Nervous System - Worker Concurrency & Queue Telemetry Tests
 * S06-AC-08, S06-AC-09
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerService } from '../../src/worker/worker.js';
import { getQueueMetrics } from '../../src/worker/queueMetrics.js';
import { config } from '../../src/lib/config.js';

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

describe('Worker Concurrency and Capacity Reservation (S06-AC-08)', () => {
  let worker: WorkerService;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new WorkerService('worker-concurrency-test');
  });

  it('honors maxConcurrency and rejects new claims when slots are filled', async () => {
    const max = config.worker.maxConcurrency;

    // Fill worker active jobs up to max concurrency
    for (let i = 0; i < max; i++) {
      (worker as any).activeJobs.set(`job-conc-${i}`, {
        job: { id: `job-conc-${i}`, job_type: 'scan_follow_ups', payload: {}, attempt: 1, max_attempts: 3 },
        promise: new Promise(() => {}),
      });
    }

    const claimed = await worker.pollOnce();
    expect(claimed).toBe(false);
    expect(mockSupabase.rpc).not.toHaveBeenCalledWith('claim_next_job', expect.anything());
  });

  it('reserves claim slot in-flight to prevent race conditions during burst polls', async () => {
    // With 0 active jobs and maxConcurrency=3, 4 simultaneous polls should not exceed capacity
    mockSupabase.rpc.mockImplementation((fn: string) => {
      if (fn === 'claim_next_job') {
        // Return no job
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: 0 });
    });

    const polls = Promise.all([
      worker.pollOnce(),
      worker.pollOnce(),
      worker.pollOnce(),
      worker.pollOnce(),
    ]);

    const results = await polls;
    // All returned false because claim_next_job returned empty, and inFlightClaims was cleanly managed
    expect(results).toEqual([false, false, false, false]);
    expect((worker as any).inFlightClaims).toBe(0);
  });
});

describe('Queue Depth, Oldest Age & Worker Health Telemetry (S06-AC-09)', () => {
  let worker: WorkerService;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new WorkerService('worker-telemetry-test');
  });

  it('calculates comprehensive queue telemetry from database states', async () => {
    const tenMinutesAgo = new Date(Date.now() - 600 * 1000).toISOString();

    // Mock count calls for statuses: queued, claimed, running, failed, dead_letter, completed
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn().mockImplementation((_fields: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.count === 'exact') {
              return {
                eq: vi.fn().mockImplementation((col: string, val: string) => {
                  if (col === 'status') {
                    if (val === 'queued') {
                      return {
                        gt: vi.fn().mockResolvedValue({ count: 2, error: null }), // retry_wait
                        then: (resolve: any) => resolve({ count: 5, error: null }),
                      };
                    }
                    if (val === 'claimed') {
                      return {
                        gt: vi.fn().mockResolvedValue({ count: 2, error: null }), // active_leases
                        then: (resolve: any) => resolve({ count: 2, error: null }),
                      };
                    }
                    if (val === 'running') return Promise.resolve({ count: 1, error: null });
                    if (val === 'failed') return Promise.resolve({ count: 3, error: null });
                    if (val === 'dead_letter') return Promise.resolve({ count: 1, error: null });
                    if (val === 'completed') return Promise.resolve({ count: 42, error: null });
                  }
                  return Promise.resolve({ count: 0, error: null });
                }),
              };
            }
            // For oldest job query
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { created_at: tenMinutesAgo },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }),
        };
      }
      return { select: vi.fn() };
    });

    const metrics = await getQueueMetrics(worker);

    expect(metrics).toBeDefined();
    // Depth: queued (5) + claimed (2) + running (1) = 8
    expect(metrics.depth).toBe(8);
    expect(metrics.breakdown.queued).toBe(5);
    expect(metrics.breakdown.claimed).toBe(2);
    expect(metrics.breakdown.running).toBe(1);
    expect(metrics.breakdown.failed).toBe(3);
    expect(metrics.breakdown.dead_letter).toBe(1);
    expect(metrics.breakdown.completed).toBe(42);

    // Oldest job should be ~600 seconds old
    expect(metrics.oldest_queued_age_seconds).toBeGreaterThanOrEqual(590);
    expect(metrics.oldest_queued_age_seconds).toBeLessThanOrEqual(610);

    // Worker details
    expect(metrics.worker).toBeDefined();
    expect(metrics.worker?.worker_id).toBe('worker-telemetry-test');
    expect(metrics.worker?.max_concurrency).toBe(config.worker.maxConcurrency);
  });
});
