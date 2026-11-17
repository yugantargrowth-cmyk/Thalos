/**
 * THALOS Background Worker
 * ─────────────────────────────────────────────────────────────
 * Polls the jobs table using FOR UPDATE SKIP LOCKED.
 * Processes: document ingestion, CSV/spreadsheet import,
 * follow-up scanning, invoice overdue detection, approval expiry.
 *
 * Honors worker concurrency (WORKER_MAX_CONCURRENCY).
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
  activeCount: number;
  maxConcurrency: number;
  inFlightJob: { id: string; type: string } | null;
  inFlightJobs: Array<{ id: string; type: string }>;
  pollIntervalMs: number;
}

export class WorkerService {
  public readonly workerId: string;
  private running: boolean = false;
  private shutdownRequested: boolean = false;
  private activeJobs: Map<string, { job: JobRow; promise: Promise<void> }> = new Map();
  private healthServer: HttpServer | null = null;
  private loopPromise: Promise<void> | null = null;
  private startTime: number = Date.now();

  private readonly jobHandlers: Record<string, (payload: Record<string, unknown>) => Promise<void>> = {
    ingest_document: processIngestionJob,
    import_csv: this.importCsv.bind(this),
    scan_follow_ups: this.scanFollowUps.bind(this),
    mark_overdue_invoices: this.markOverdueInvoices.bind(this),
    expire_approvals: this.expireApprovals.bind(this),
  };

  constructor(workerId?: string) {
    this.workerId = workerId || `worker_${uuidv4().slice(0, 8)}`;
  }

  public getStatus(): WorkerStatus {
    const inFlightJobs: Array<{ id: string; type: string }> = [];
    for (const [id, entry] of this.activeJobs.entries()) {
      inFlightJobs.push({ id, type: entry.job.job_type });
    }

    return {
      service: 'thalos-worker',
      workerId: this.workerId,
      running: this.running,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      activeCount: this.activeJobs.size,
      maxConcurrency: config.worker.maxConcurrency,
      inFlightJob: inFlightJobs.length > 0 ? inFlightJobs[0] : null,
      inFlightJobs,
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
        completed_at: willRetry ? null : new Date().toISOString(),
      }).eq('id', job.id);
    }
  }

  public async pollOnce(): Promise<boolean> {
    if (this.shutdownRequested) return false;
    if (this.activeJobs.size >= config.worker.maxConcurrency) return false;

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
      logger.info('Processing job', { job_type: job.job_type, job_id: job.id, active_count: this.activeJobs.size + 1 });

      const promise = this.processJob(job).finally(() => {
        this.activeJobs.delete(job.id);
      });

      this.activeJobs.set(job.id, { job, promise });
      return true;
    } catch (err) {
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

  /**
   * Worker handler for import_csv jobs (Fixes R-004)
   * Parses CSV content and inserts validated leads or clients.
   */
  public async importCsv(payload: Record<string, unknown>): Promise<void> {
    const supabase = getSupabase();
    const targetTable = (payload.target_table as string) || 'leads';
    let csvData = (payload.csv_data as string) || '';

    // If document_id is provided, read content from document chunks
    if (!csvData && payload.document_id) {
      const { data: chunks } = await supabase
        .from('document_chunks')
        .select('content')
        .eq('document_id', payload.document_id)
        .order('chunk_index', { ascending: true });
      if (chunks && chunks.length > 0) {
        csvData = chunks.map(c => c.content).join('');
      }
    }

    if (!csvData.trim()) {
      throw new Error('import_csv: No CSV data provided or extracted');
    }

    // Parse CSV lines
    const lines = csvData.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      throw new Error('import_csv: CSV must contain a header and at least one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    let importedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (values[idx] !== undefined) row[h] = values[idx];
      });

      if (targetTable === 'leads') {
        const leadPayload = {
          name: row.name || row.business_name || row.company || `Lead row ${i}`,
          phone: row.phone || row.contact_number || `+91000000000${i}`.slice(0, 15),
          contact_name: row.contact_name || row.contact || null,
          email: row.email || null,
          industry: row.industry || null,
          location: row.location || row.city || null,
          stage: 'new',
          source: 'import',
        };
        const { error } = await supabase.from('leads').upsert(leadPayload, { onConflict: 'phone' });
        if (!error) importedCount++;
      } else if (targetTable === 'clients') {
        const clientPayload = {
          business_name: row.business_name || row.name || `Client row ${i}`,
          contact_name: row.contact_name || row.contact || 'Main Contact',
          phone: row.phone || `+91000000000${i}`.slice(0, 15),
          email: row.email || null,
          status: 'active',
          start_date: new Date().toISOString().split('T')[0],
          monthly_value: parseFloat(row.monthly_value || '0') || 0,
        };
        const { error } = await supabase.from('clients').insert(clientPayload);
        if (!error) importedCount++;
      }
    }

    logger.info('import_csv completed', { targetTable, importedCount, totalRows: lines.length - 1 });
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
      max_concurrency: config.worker.maxConcurrency,
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
      // Poll up to maxConcurrency available slots
      const availableCapacity = config.worker.maxConcurrency - this.activeJobs.size;
      if (availableCapacity > 0) {
        for (let i = 0; i < availableCapacity; i++) {
          const polled = await this.pollOnce();
          if (!polled) break;
        }
      }

      maintenanceTick++;
      if (maintenanceTick >= MAINTENANCE_EVERY) {
        await this.runMaintenanceTasks();
        maintenanceTick = 0;
      }
      await this.sleep(config.worker.pollIntervalMs);
    }
  }

  public async stop(drainTimeoutMs: number = 10000): Promise<void> {
    this.shutdownRequested = true;
    logger.info(`Worker ${this.workerId} shutdown requested`, { active_jobs: this.activeJobs.size });

    // Wait for in-flight jobs if running (up to drainTimeoutMs)
    const startWait = Date.now();
    while (this.activeJobs.size > 0 && Date.now() - startWait < drainTimeoutMs) {
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
