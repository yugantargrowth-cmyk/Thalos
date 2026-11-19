/**
 * THALOS Background Worker Queue Metrics & Operational Telemetry
 * ─────────────────────────────────────────────────────────────
 * Exposes real-time queue depth, age of oldest queued job,
 * retry wait counts, failures, dead-letter counts, and worker health.
 */

import { getSupabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import type { WorkerService } from './worker.js';

export interface QueueMetrics {
  depth: number;
  breakdown: {
    queued: number;
    claimed: number;
    running: number;
    retry_wait: number;
    failed: number;
    dead_letter: number;
    completed: number;
  };
  oldest_queued_age_seconds: number | null;
  active_leases: number;
  worker?: {
    worker_id: string;
    running: boolean;
    uptime_seconds: number;
    active_count: number;
    max_concurrency: number;
    in_flight_jobs: Array<{ id: string; type: string }>;
  };
  timestamp: string;
}

export async function getQueueMetrics(worker?: WorkerService): Promise<QueueMetrics> {
  const supabase = getSupabase();
  const now = Date.now();

  const metrics: QueueMetrics = {
    depth: 0,
    breakdown: {
      queued: 0,
      claimed: 0,
      running: 0,
      retry_wait: 0,
      failed: 0,
      dead_letter: 0,
      completed: 0,
    },
    oldest_queued_age_seconds: null,
    active_leases: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    // 1. Status counts
    const statuses = ['queued', 'claimed', 'running', 'failed', 'dead_letter', 'completed'] as const;
    await Promise.all(
      statuses.map(async (status) => {
        const { count } = await supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', status);
        metrics.breakdown[status] = count ?? 0;
      })
    );

    // 2. Retry wait jobs (queued with attempt > 0)
    const { count: retryWait } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued')
      .gt('attempt', 0);
    metrics.breakdown.retry_wait = retryWait ?? 0;

    // 3. Queue depth is active pending: queued + claimed + running
    metrics.depth = metrics.breakdown.queued + metrics.breakdown.claimed + metrics.breakdown.running;

    // 4. Oldest queued job age
    const { data: oldest } = await supabase
      .from('jobs')
      .select('created_at')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (oldest && oldest.created_at) {
      const createdMs = Date.parse(oldest.created_at);
      if (!isNaN(createdMs)) {
        metrics.oldest_queued_age_seconds = Math.max(0, Math.floor((now - createdMs) / 1000));
      }
    }

    // 5. Active unexpired leases
    const { count: activeLeases } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'claimed')
      .gt('lease_expires_at', new Date(now).toISOString());
    metrics.active_leases = activeLeases ?? metrics.breakdown.claimed;
  } catch (err) {
    logger.warn('Failed to retrieve full queue metrics from database', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 6. Include worker telemetry if available
  if (worker) {
    const status = worker.getStatus();
    metrics.worker = {
      worker_id: status.workerId,
      running: status.running,
      uptime_seconds: status.uptime,
      active_count: status.activeCount,
      max_concurrency: status.maxConcurrency,
      in_flight_jobs: status.inFlightJobs,
    };
  }

  return metrics;
}
