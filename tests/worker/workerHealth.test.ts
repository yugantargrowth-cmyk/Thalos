import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { WorkerService } from '../../src/worker/worker.js';

describe('Worker runtime lifecycle and health endpoints (L14-AC-03)', () => {
  const TEST_WORKER_PORT = 3099;
  let worker: WorkerService;

  beforeAll(async () => {
    worker = new WorkerService('test_worker_unit');
    await worker.start({ healthPort: TEST_WORKER_PORT, skipLoop: true });
  });

  afterAll(async () => {
    await worker.stop();
  });

  function fetchWorker(path: string): Promise<{ statusCode: number; body: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${TEST_WORKER_PORT}${path}`, (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode || 500, body: JSON.parse(raw) });
          } catch (e) {
            resolve({ statusCode: res.statusCode || 500, body: raw });
          }
        });
      });
      req.on('error', reject);
    });
  }

  it('worker exposes GET /health returning workerId, running status, and uptime', async () => {
    const res = await fetchWorker('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('thalos-worker');
    expect(res.body.workerId).toBe('test_worker_unit');
    expect(res.body.running).toBe(true);
    expect(typeof res.body.uptime).toBe('number');
  });

  it('worker exposes GET /ready returning vault and database checks', async () => {
    const res = await fetchWorker('/ready');
    expect([200, 503]).toContain(res.statusCode);
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.vault).toBe('ok');
  });

  it('reports status object accurately through getStatus()', () => {
    const status = worker.getStatus();
    expect(status.service).toBe('thalos-worker');
    expect(status.workerId).toBe('test_worker_unit');
    expect(status.running).toBe(true);
    expect(status.inFlightJob).toBeNull();
  });
});
