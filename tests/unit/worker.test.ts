import { describe, it, expect } from 'vitest';

// Pure state-machine helpers extracted for testing

type JobStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'dead_letter';

function computeNextStatus(
  currentStatus: JobStatus,
  attempt: number,
  maxAttempts: number,
  success: boolean
): JobStatus {
  if (currentStatus === 'claimed' && success) return 'completed';
  if (currentStatus === 'claimed' && !success && attempt < maxAttempts) return 'queued';
  if (currentStatus === 'claimed' && !success && attempt >= maxAttempts) return 'failed';
  return currentStatus;
}

function isLeaseExpired(leaseExpiresAt: Date, now: Date): boolean {
  return now > leaseExpiresAt;
}

function computeBackoff(attempt: number, baseSeconds: number): number {
  return Math.pow(2, attempt) * baseSeconds;
}

describe('Job state machine', () => {
  it('transitions claimed→completed on success', () => {
    expect(computeNextStatus('claimed', 1, 3, true)).toBe('completed');
  });

  it('transitions claimed→queued for retry on failure when attempts remain', () => {
    expect(computeNextStatus('claimed', 1, 3, false)).toBe('queued');
  });

  it('transitions claimed→failed when max attempts reached', () => {
    expect(computeNextStatus('claimed', 3, 3, false)).toBe('failed');
  });

  it('leaves unrelated statuses unchanged', () => {
    expect(computeNextStatus('completed', 1, 3, false)).toBe('completed');
  });
});

describe('Worker lease management', () => {
  it('detects expired lease', () => {
    const expiry = new Date(Date.now() - 1000); // 1 second ago
    expect(isLeaseExpired(expiry, new Date())).toBe(true);
  });

  it('allows active lease', () => {
    const expiry = new Date(Date.now() + 60000); // 1 minute from now
    expect(isLeaseExpired(expiry, new Date())).toBe(false);
  });

  it('computes exponential backoff correctly', () => {
    expect(computeBackoff(0, 30)).toBe(30);
    expect(computeBackoff(1, 30)).toBe(60);
    expect(computeBackoff(2, 30)).toBe(120);
    expect(computeBackoff(3, 30)).toBe(240);
  });
});
