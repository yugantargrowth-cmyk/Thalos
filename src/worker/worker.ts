/**
 * THALOS Background Worker
 * ─────────────────────────────────────────────────────────────
 * Polls the jobs table using FOR UPDATE SKIP LOCKED.
 * Processes: document ingestion, follow-up scanning,
 * invoice overdue detection, approval expiry.
 *
 * Run as a separate process alongside the API server.
 * On Fly.io: separate Machine. On Railway: separate service.
 */

import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { processIngestionJob } from '../persistence/ingestionQueue.js';
import { validateVaultConfig } from '../lib/vault.js';

const WORKER_ID = `worker_${uuidv4().slice(0, 8)}`;
let running = false;
let shutdownRequested = false;

type JobRow = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempt: number;
  max_attempts: number;
};

const JOB_HANDLERS: Record<string, (payload: Record<string, unknown>) => Promise<void>> = {
  ingest_document: processIngestionJob,
  scan_follow_ups: scanFollowUps,
  mark_overdue_invoices: markOverdueInvoices,
  expire_approvals: expireApprovals,
};

async function processJob(job: JobRow): Promise<void> {
  const supabase = getSupabase();
  const handler = JOB_HANDLERS[job.job_type];

  if (!handler) {
    logger.warn('No handler for job type', { job_type: job.job_type, job_id: job.id });
    await supabase.from('jobs').update({
      status: 'failed',
      error: `No handler registered for job type: ${job.job_type}`,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id);
    return;
  }

  try {
    await handler(job.payload);
    await supabase.from('jobs').update({
      status: 'completed',
      result: { completed_at: new Date().toISOString() },
      completed_at: new Date().toISOString(),
    }).eq('id', job.id);
    logger.info('Job completed', { job_type: job.job_type, job_id: job.id, attempt: job.attempt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Job failed', { job_id: job.id, job_type: job.job_type, error: msg, attempt: job.attempt });

    const willRetry = job.attempt < job.max_attempts;
    await supabase.from('jobs').update({
      status: willRetry ? 'queued' : 'failed',
      error: msg.slice(0, 1000),
      worker_id: null,
      lease_expires_at: null,
      next_attempt_at: willRetry
        ? new Date(Date.now() + Math.pow(2, job.attempt) * 30000).toISOString()
        : new Date().toISOString(),
    }).eq('id', job.id);
  }
}

async function pollOnce(): Promise<boolean> {
  if (running || shutdownRequested) return false;
  running = true;

  const supabase = getSupabase();
  try {
    // Reclaim expired leases first
    await supabase.rpc('reclaim_expired_leases');
    await supabase.rpc('move_to_dead_letter');

    // Claim next job atomically
    const { data: jobs } = await supabase.rpc('claim_next_job', {
      p_worker_id: WORKER_ID,
      p_lease_seconds: config.worker.leaseSeconds,
    });

    if (!jobs || jobs.length === 0) return false;

    const job = jobs[0] as JobRow;
    logger.info('Processing job', { job_type: job.job_type, job_id: job.id });
    await processJob(job);
    return true;
  } catch (err) {
    logger.error('Worker poll error', { error: err instanceof Error ? err.message : err });
    return false;
  } finally {
    running = false;
  }
}

// System maintenance jobs — run on a schedule, not via job queue
async function runMaintenanceTasks(): Promise<void> {
  const supabase = getSupabase();
  try {
    await supabase.rpc('expire_approvals');
    await supabase.rpc('move_to_dead_letter');
  } catch (err) {
    logger.warn('Maintenance task error', { err });
  }
}

async function scanFollowUps(_payload: Record<string, unknown>): Promise<void> {
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('follow_ups')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_date', today);
}

async function markOverdueInvoices(_payload: Record<string, unknown>): Promise<void> {
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('invoices')
    .update({ status: 'overdue' })
    .in('status', ['sent', 'partially_paid'])
    .lt('due_date', today);
}

async function expireApprovals(_payload: Record<string, unknown>): Promise<void> {
  const supabase = getSupabase();
  await supabase.rpc('expire_approvals');
}

async function main() {
  validateVaultConfig();
  logger.info(`Worker ${WORKER_ID} starting`, { poll_interval_ms: config.worker.pollIntervalMs });

  // Graceful shutdown
  process.on('SIGTERM', () => { shutdownRequested = true; logger.info('Worker shutdown requested'); });
  process.on('SIGINT', () => { shutdownRequested = true; });

  // Schedule daily maintenance jobs
  let maintenanceTick = 0;
  const MAINTENANCE_EVERY = Math.floor(3600000 / config.worker.pollIntervalMs); // ~every hour

  while (!shutdownRequested) {
    await pollOnce();
    maintenanceTick++;
    if (maintenanceTick >= MAINTENANCE_EVERY) {
      await runMaintenanceTasks();
      maintenanceTick = 0;
    }
    await sleep(config.worker.pollIntervalMs);
  }

  logger.info('Worker stopped cleanly');
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  logger.error('Worker fatal error', { err });
  process.exit(1);
});
