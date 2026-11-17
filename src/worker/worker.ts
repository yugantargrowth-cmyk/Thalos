/**
 * THALOS Background Worker
 * ─────────────────────────────────────────────────────────────
 * Polls the jobs table using FOR UPDATE SKIP LOCKED.
 * Processes: document ingestion, follow-up scanning,
 * invoice overdue detection, approval expiry.
 *
 * Runs as a separate process alongside the API server.
 * Exposes an HTTP health/readiness endpoint on WORKER_PORT (default 3001).
 */

import 'dotenv/config';
import http, { type Server as HttpServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase } from '../lib/supabase.js';
import { config, validateConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { processIngestionJob } from '../persistence/ingestionQueue.js';
import { validateVaultConfig } from '../lib/vault.js';

export type JobRow = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempt: number;
  max_attempts: number;
};

export interface WorkerStatus {
  service: 'thalos-worker';
  workerId: string;
  running: boolean;
  uptime: number;
  inFlightJob: { id: string; type: string } | null;
  pollIntervalMs: number;
}

export class WorkerService {
  public readonly workerId: string;
  private running: boolean = false;
  private shutdownRequested: boolean = false;
  private inFlightJob: { id: string; type: string } | null = null;
  private healthServer: HttpServer | null = null;
  private loopPromise: Promise<void> | null = null;
  private startTime: number = Date.now();

  private readonly jobHandlers: Record<string, (payload: Record<string, unknown>) => Promise<void>> = {
    ingest_document: processIngestionJob,
    scan_follow_ups: this.scanFollowUps.bind(this),
    mark_overdue_invoices: this.markOverdueInvoices.bind(this),
    expire_approvals: this.expireApprovals.bind(this),
  };

  constructor(workerId?: string) {
    this.workerId = workerId || `worker_${uuidv4().slice(0, 8)}`;
  }

  public getStatus(): WorkerStatus {
    return {
      service: 'thalos-worker',
      workerId: this.workerId,
      running: this.running,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      inFlightJob: this.inFlightJob,
      pollIntervalMs: config.worker.pollIntervalMs,
    };
  }

  public async startHealthServer(port: number = config.workerPort): Promise<HttpServer> {
    const server = http.createServer(async (req, res) => {
      const url = req.url || '/';

      if (url === '/health' || url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          ...this.getStatus(),
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      if (url === '/ready' || url === '/health/ready' || url === '/api/health/ready') {
        const checks: Record<string, string> = {};
        let isReady = true;

        try {
          validateVaultConfig();
          checks.vault = 'ok';
        } catch (err) {
          checks.vault = `failed: ${err instanceof Error ? err.message : String(err)}`;
          isReady = false;
        }

        try {
          const isPlaceholder = config.supabase.url.includes('placeholder') || config.supabase.serviceRoleKey.includes('placeholder');
          if (isPlaceholder) {
            checks.database = 'skipped (development placeholder)';
          } else {
            const supabase = getSupabase();
            const { error } = await supabase.from('jobs').select('id', { head: true, count: 'exact' });
            if (error) {
              checks.database = `error: ${error.message}`;
              isReady = false;
            } else {
              checks.database = 'ok';
            }
          }
        } catch (err) {
          checks.database = `failed: ${err instanceof Error ? err.message : String(err)}`;
          isReady = false;
        }

        const statusCode = isReady ? 200 : 503;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: isReady ? 'ready' : 'not_ready',
          workerId: this.workerId,
          checks,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Not found: ${req.method} ${url}` }));
    });

    return new Promise((resolve, reject) => {
      server.listen(port, () => {
        logger.info(`Worker health endpoint listening on port ${port}`);
        this.healthServer = server;
        resolve(server);
      });
      server.on('error', (err) => {
        logger.error('Worker health server error', { error: err.message });
        reject(err);
      });
    });
  }

  public async processJob(job: JobRow): Promise<void> {
    const supabase = getSupabase();
    const handler = this.jobHandlers[job.job_type];

    if (!handler) {
      logger.warn('No handler for job type', { job_type: job.job_type, job_id: job.id });
      await supabase.from('jobs').update({
        status: 'failed',
        error: `No handler registered for job type: ${job.job_type}`,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);
      return;
    }

    this.inFlightJob = { id: job.id, type: job.job_type };
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
    } finally {
      this.inFlightJob = null;
    }
  }

  public async pollOnce(): Promise<boolean> {
    if (this.shutdownRequested) return false;

    const supabase = getSupabase();
    try {
      // Reclaim expired leases first
      await supabase.rpc('reclaim_expired_leases');
      await supabase.rpc('move_to_dead_letter');

      // Claim next job atomically
      const { data: jobs } = await supabase.rpc('claim_next_job', {
        p_worker_id: this.workerId,
        p_lease_seconds: config.worker.leaseSeconds,
      });

      if (!jobs || jobs.length === 0) return false;

      const job = jobs[0] as JobRow;
      logger.info('Processing job', { job_type: job.job_type, job_id: job.id });
      await this.processJob(job);
      return true;
    } catch (err) {
      // If running on placeholder Supabase in local development/test, log debug rather than spamming errors
      const isPlaceholder = config.supabase.url.includes('placeholder');
      if (!isPlaceholder) {
        logger.error('Worker poll error', { error: err instanceof Error ? err.message : err });
      }
      return false;
    }
  }

  public async runMaintenanceTasks(): Promise<void> {
    const supabase = getSupabase();
    try {
      await supabase.rpc('expire_approvals');
      await supabase.rpc('move_to_dead_letter');
    } catch (err) {
      const isPlaceholder = config.supabase.url.includes('placeholder');
      if (!isPlaceholder) {
        logger.warn('Maintenance task error', { err });
      }
    }
  }

  private async scanFollowUps(_payload: Record<string, unknown>): Promise<void> {
    const supabase = getSupabase();
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('follow_ups')
      .update({ status: 'overdue' })
      .eq('status', 'pending')
      .lt('due_date', today);
  }

  private async markOverdueInvoices(_payload: Record<string, unknown>): Promise<void> {
    const supabase = getSupabase();
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('invoices')
      .update({ status: 'overdue' })
      .in('status', ['sent', 'partially_paid'])
      .lt('due_date', today);
  }

  private async expireApprovals(_payload: Record<string, unknown>): Promise<void> {
    const supabase = getSupabase();
    await supabase.rpc('expire_approvals');
  }

  public async start(options?: { healthPort?: number; skipLoop?: boolean }): Promise<void> {
    validateConfig();
    validateVaultConfig();

    this.running = true;
    this.shutdownRequested = false;
    this.startTime = Date.now();

    logger.info(`Worker ${this.workerId} starting`, {
      poll_interval_ms: config.worker.pollIntervalMs,
      lease_seconds: config.worker.leaseSeconds,
    });

    if (options?.healthPort !== undefined || config.workerPort) {
      const port = options?.healthPort ?? config.workerPort;
      await this.startHealthServer(port);
    }

    if (!options?.skipLoop) {
      this.loopPromise = this.runLoop();
    }
  }

  private async runLoop(): Promise<void> {
    let maintenanceTick = 0;
    const MAINTENANCE_EVERY = Math.max(1, Math.floor(3600000 / config.worker.pollIntervalMs));

    while (!this.shutdownRequested) {
      await this.pollOnce();
      maintenanceTick++;
      if (maintenanceTick >= MAINTENANCE_EVERY) {
        await this.runMaintenanceTasks();
        maintenanceTick = 0;
      }
      await this.sleep(config.worker.pollIntervalMs);
    }
  }

  public async stop(): Promise<void> {
    this.shutdownRequested = true;
    logger.info(`Worker ${this.workerId} shutdown requested`);

    // Wait for in-flight job if running (max 10s timeout)
    const startWait = Date.now();
    while (this.inFlightJob && Date.now() - startWait < 10000) {
      await this.sleep(200);
    }

    if (this.healthServer) {
      await new Promise<void>((resolve) => {
        this.healthServer!.close(() => resolve());
      });
      this.healthServer = null;
    }

    this.running = false;
    logger.info(`Worker ${this.workerId} stopped cleanly`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

export const defaultWorker = new WorkerService();

export async function startWorker(port?: number): Promise<WorkerService> {
  await defaultWorker.start({ healthPort: port });
  return defaultWorker;
}

export async function stopWorker(): Promise<void> {
  await defaultWorker.stop();
}

// Auto-run when executed directly
const isDirectRun = process.env.NODE_ENV !== 'test' && (
  !process.argv[1] ||
  process.argv[1].endsWith('worker.ts') ||
  process.argv[1].endsWith('worker.js')
);

if (isDirectRun) {
  const handleSignal = async (signal: string) => {
    logger.info(`Received ${signal}, stopping worker...`);
    await stopWorker();
    process.exit(0);
  };

  process.on('SIGTERM', () => void handleSignal('SIGTERM'));
  process.on('SIGINT', () => void handleSignal('SIGINT'));

  startWorker().catch((err) => {
    logger.error('Worker fatal error', { err });
    process.exit(1);
  });
}
