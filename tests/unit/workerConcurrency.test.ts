import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerService, JobRow } from '../../src/worker/worker.js';
import { config } from '../../src/lib/config.js';

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

describe('Worker Concurrency and Lifecycle (L11-AC-06, R-008)', () => {
  let worker: WorkerService;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new WorkerService('worker-unit-test');
  });

  it('respects config.worker.maxConcurrency and throttles claiming when saturated', async () => {
    // Fill active jobs up to maxConcurrency
    const max = config.worker.maxConcurrency;
    for (let i = 0; i < max; i++) {
      const dummyJob: JobRow = {
        id: `job-${i}`,
        job_type: 'import_csv',
        payload: {},
        attempt: 1,
        max_attempts: 3,
      };
      (worker as any).activeJobs.set(dummyJob.id, {
        job: dummyJob,
        promise: new Promise(() => {}), // never resolves in this test
      });
    }

    const claimed = await worker.pollOnce();
    expect(claimed).toBe(false);
    expect(mockSupabase.rpc).not.toHaveBeenCalledWith('claim_next_job', expect.anything());
  });

  it('reports accurate status with active jobs and concurrency', () => {
    const statusBefore = worker.getStatus();
    expect(statusBefore.activeCount).toBe(0);
    expect(statusBefore.maxConcurrency).toBe(config.worker.maxConcurrency);

    const dummyJob: JobRow = {
      id: 'active-job-1',
      job_type: 'scan_follow_ups',
      payload: {},
      attempt: 1,
      max_attempts: 3,
    };
    (worker as any).activeJobs.set(dummyJob.id, {
      job: dummyJob,
      promise: Promise.resolve(),
    });

    const statusAfter = worker.getStatus();
    expect(statusAfter.activeCount).toBe(1);
    expect(statusAfter.inFlightJobs).toEqual([{ id: 'active-job-1', type: 'scan_follow_ups' }]);
  });

  it('performs graceful shutdown waiting for active jobs to finish', async () => {
    let resolved = false;
    const slowJobPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        resolved = true;
        resolve();
      }, 50);
    });

    (worker as any).activeJobs.set('job-slow', {
      job: { id: 'job-slow', job_type: 'scan_follow_ups', payload: {}, attempt: 1, max_attempts: 3 },
      promise: slowJobPromise,
    });

    const stopPromise = worker.stop(500);
    await slowJobPromise;
    (worker as any).activeJobs.delete('job-slow');
    await stopPromise;

    expect(resolved).toBe(true);
    expect(worker.getStatus().running).toBe(false);
  });
});
