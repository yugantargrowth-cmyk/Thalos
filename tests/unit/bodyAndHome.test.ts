import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../../src/api/app.js';
import { getSupabase } from '../../src/lib/supabase.js';
import { issueToken } from '../../src/api/middleware/auth.js';

describe('Mission S08: Body & Home (Product Shell, PWA, Runtime, Telemetry, and Recovery)', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();

    const supabase = getSupabase();
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'system_config') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { key: 'company.name', value: 'Yugantar Growth', description: 'Company Name' },
            ],
            error: null,
          }),
          limit: vi.fn().mockResolvedValue({ data: [{ key: 'company.name' }], error: null }),
        } as any;
      }
      if (table === 'audit_log') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'log-1',
                created_at: new Date().toISOString(),
                actor: 'founder',
                event_type: 'lead.created',
                description: 'Created lead Aura Textiles',
                metadata: { source: 'manual' },
              },
              {
                id: 'log-2',
                created_at: new Date().toISOString(),
                actor: 'system',
                event_type: 'job.failed',
                description: 'Failed to dispatch email due to SMTP timeout',
                metadata: { error: 'ETIMEDOUT' },
              },
            ],
            error: null,
            count: 2,
          }),
        } as any;
      }
      if (table === 'leads') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { stage: 'new', estimated_value: 50000, created_at: new Date().toISOString() },
              { stage: 'qualified', estimated_value: 120000, created_at: new Date().toISOString() },
              { stage: 'won', estimated_value: 80000, created_at: new Date().toISOString() },
            ],
            error: null,
          }),
        } as any;
      }
      if (table === 'clients') {
        const queryObj: any = {
          data: [{ id: 'c1', business_name: 'Aura Textiles', status: 'active', monthly_value: 45000 }],
          error: null,
        };
        queryObj.select = vi.fn().mockReturnValue(queryObj);
        queryObj.eq = vi.fn().mockReturnValue(queryObj);
        queryObj.neq = vi.fn().mockReturnValue(queryObj);
        queryObj.order = vi.fn().mockReturnValue(queryObj);
        queryObj.limit = vi.fn().mockReturnValue(queryObj);
        queryObj.then = (resolve: any) => Promise.resolve({ data: queryObj.data, error: null }).then(resolve);
        return queryObj;
      }
      if (table === 'invoices') {
        const queryObj: any = {
          data: [{ id: 'inv-1', total: 50000, balance_due: 10000, status: 'partially_paid' }],
          error: null,
        };
        queryObj.select = vi.fn().mockReturnValue(queryObj);
        queryObj.neq = vi.fn().mockReturnValue(queryObj);
        queryObj.eq = vi.fn().mockReturnValue(queryObj);
        queryObj.then = (resolve: any) => Promise.resolve({ data: queryObj.data, error: null }).then(resolve);
        return queryObj;
      }
      if (table === 'payments') {
        const queryObj: any = {
          data: [{ amount: 40000 }],
          error: null,
        };
        queryObj.select = vi.fn().mockReturnValue(queryObj);
        queryObj.gte = vi.fn().mockReturnValue(queryObj);
        queryObj.then = (resolve: any) => Promise.resolve({ data: queryObj.data, error: null }).then(resolve);
        return queryObj;
      }
      if (table === 'agents') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                agent_id: 'thalos',
                display_name: 'THALOS',
                mission: 'Central Orchestrator',
                status: 'operational',
                allowed_tools: ['*'],
                model_capability: 'quality',
                approval_policy: 'notify',
                risk_classification: 'low',
                max_steps: 6,
              },
              {
                agent_id: 'closer',
                display_name: 'Closer',
                mission: 'Proposals & Invoices',
                status: 'operational',
                allowed_tools: ['build_proposal', 'create_invoice'],
                model_capability: 'quality',
                approval_policy: 'require_approval',
                risk_classification: 'high',
                max_steps: 4,
              },
            ],
            error: null,
          }),
        } as any;
      }
      if (table === 'integrations') {
        return {
          select: vi.fn().mockReturnThis(),
          neq: vi.fn().mockResolvedValue({
            data: [
              { integration_id: 'groq', status: 'operational', display_name: 'Groq LLM' },
              { integration_id: 'gemini', status: 'operational', display_name: 'Google Gemini' },
            ],
            error: null,
          }),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                integration_id: 'groq',
                display_name: 'Groq LLM',
                status: 'operational',
                metadata: { _enc: 'iv:salt:enc' },
              },
            ],
            error: null,
          }),
        } as any;
      }
      if (table === 'approval_queue') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
        } as any;
      }
      if (table === 'jobs') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any;
    });
  });

  describe('S08-AC-01: Documented Repeatable Startup & Multi-Tier Health Checks', () => {
    it('verifies GET /health returns standard status, uptime, service, and correlation ID', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('thalos-api');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.headers['x-correlation-id']).toBeDefined();
    });

    it('verifies GET /health/ready returns deep readiness evaluation results', async () => {
      const res = await request(app).get('/health/ready');
      expect([200, 503]).toContain(res.status);
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.vault).toBe('ok');
    });

    it('verifies GET /api/system/health returns comprehensive operational checks', async () => {
      const token = issueToken();
      const res = await request(app)
        .get('/api/system/health')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(['healthy', 'partial', 'degraded']).toContain(res.body.status);
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database).toBeDefined();
      expect(res.body.checks.integrations).toBeDefined();
      expect(res.body.checks.approvals).toBeDefined();
    });
  });

  describe('S08-AC-02, S08-AC-03 & S08-AC-08: Core -> Environments -> Workspaces & PWA Adaptive Shell', () => {
    const publicDir = path.resolve(process.cwd(), 'public');

    it('verifies public/manifest.json exists and satisfies PWA criteria', () => {
      const manifestPath = path.join(publicDir, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.name).toContain('THALOS');
      expect(manifest.short_name).toBe('THALOS');
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('/');
      expect(manifest.theme_color).toBe('#50D9D0');
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(1);
    });

    it('verifies public/sw.js exists and implements offline fallback handling', () => {
      const swPath = path.join(publicDir, 'sw.js');
      expect(fs.existsSync(swPath)).toBe(true);

      const swContent = fs.readFileSync(swPath, 'utf8');
      expect(swContent).toContain("addEventListener('install'");
      expect(swContent).toContain("addEventListener('fetch'");
      expect(swContent).toContain('offline: true');
    });

    it('verifies index.html defines all 7 canonical workspace views with accessibility tabpanels', () => {
      const indexPath = path.join(publicDir, 'index.html');
      expect(fs.existsSync(indexPath)).toBe(true);

      const html = fs.readFileSync(indexPath, 'utf8');
      const expectedViews = [
        'view-command',
        'view-agents',
        'view-revenue',
        'view-clients',
        'view-knowledge',
        'view-engine',
        'view-settings',
      ];

      for (const viewId of expectedViews) {
        expect(html).toContain(`id="${viewId}"`);
        expect(html).toContain(`role="tabpanel"`);
      }

      // Tab navigation
      expect(html).toContain('role="tablist"');
      expect(html).toContain('role="tab"');

      // Landscape mobile query & offline banner
      expect(html).toContain('orientation: landscape');
      expect(html).toContain('id="offlineBanner"');
      expect(html).toContain('/manifest.json');
    });
  });

  describe('S08-AC-04 & S08-AC-06: Business Metrics and Agent State from Live API Responses', () => {
    it('verifies GET /api/leads/report derives pipeline statistics dynamically', async () => {
      const token = issueToken();
      const res = await request(app)
        .get('/api/leads/report')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.report).toBeDefined();
      expect(res.body.report.total_leads).toBe(3);
      expect(res.body.report.total_pipeline_value).toBe(250000);
      expect(res.body.report.stage_counts.qualified).toBe(1);
    });

    it('verifies GET /api/finance/summary returns live revenue and invoice summaries', async () => {
      const token = issueToken();
      const res = await request(app)
        .get('/api/finance/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.mrr).toBe('number');
      expect(typeof res.body.outstanding).toBe('number');
      expect(typeof res.body.collected_this_month).toBe('number');
    });

    it('verifies GET /api/system/agents lists canonical agents with approval and risk classifications', async () => {
      const token = issueToken();
      const res = await request(app)
        .get('/api/system/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.agents)).toBe(true);
      const thalos = res.body.agents.find((a: any) => a.agent_id === 'thalos');
      expect(thalos).toBeDefined();
      expect(thalos.approval_policy).toBe('notify');
      expect(thalos.risk_classification).toBe('low');
    });
  });

  describe('S08-AC-05: Settings Credentials Protection and Masked Values', () => {
    it('verifies GET /api/integrations masks secret credentials and never exposes plain keys', async () => {
      const token = issueToken();
      const res = await request(app)
        .get('/api/integrations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.integrations)).toBe(true);
      for (const item of res.body.integrations) {
        if (item.configured && item.apiKeyMasked) {
          expect(item.apiKeyMasked).toMatch(/\*{3,}/);
        }
        expect(JSON.stringify(item)).not.toContain('plain_secret');
      }
    });
  });

  describe('S08-AC-07: Error, Offline, and Permission-Denied Handlers', () => {
    it('verifies unauthenticated requests to protected routes return 401 permission denied', async () => {
      const res = await request(app).get('/api/leads');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authorization header');
    });

    it('verifies 404 handler returns structured error response', async () => {
      const res = await request(app).get('/api/non-existent-endpoint');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Route not found');
    });
  });

  describe('S08-AC-09: Health, Logs, Backup Status and Founder Recovery Guidance', () => {
    it('verifies GET /api/system/logs returns structured system logs with level and timestamp', async () => {
      const token = issueToken();
      const res = await request(app)
        .get('/api/system/logs?limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.logs.length).toBeGreaterThan(0);
      expect(res.body.logs[0].level).toBeDefined();
      expect(res.body.logs[0].message).toBeDefined();
      expect(res.body.logs[0].timestamp).toBeDefined();
    });

    it('verifies GET /api/system/backup returns backup status, snapshot frequency, and RPO', async () => {
      const token = issueToken();
      const res = await request(app)
        .get('/api/system/backup')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.strategy).toContain('continuous_wal');
      expect(res.body.point_in_time_recovery_enabled).toBe(true);
      expect(res.body.recovery_point_objective_minutes).toBeLessThanOrEqual(15);
      expect(res.body.retention_days).toBeGreaterThanOrEqual(14);
    });

    it('verifies GET /api/system/recovery returns detailed disaster recovery runbooks', async () => {
      const token = issueToken();
      const res = await request(app)
        .get('/api/system/recovery')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toContain('Disaster Recovery Runbook');
      expect(res.body.procedures).toBeDefined();
      expect(Array.isArray(res.body.procedures.database_restoration)).toBe(true);
      expect(Array.isArray(res.body.procedures.worker_failover)).toBe(true);
      expect(Array.isArray(res.body.procedures.credential_emergency_rotation)).toBe(true);
      expect(Array.isArray(res.body.procedures.offline_local_continuity)).toBe(true);
    });
  });
});
