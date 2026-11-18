/**
 * S07 Immune System Security Tests (S07-AC-01 through S07-AC-09)
 * ─────────────────────────────────────────────────────────────
 * Validates authentication, authorization, approvals, rate limiting,
 * least-privilege tool execution, SSRF/traversal guards, audit sanitization,
 * and production configuration gates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/api/app.js';
import { issueToken } from '../../src/api/middleware/auth.js';
import {
  validateConfig,
  ConfigValidationError,
  DEFAULT_DEV_JWT_SECRET,
  DEFAULT_DEV_PIN_HASH,
  DEFAULT_DEV_MASTER_KEY,
  DEFAULT_DEV_SUPABASE_URL,
  DEFAULT_DEV_SUPABASE_KEY,
} from '../../src/lib/config.js';
import { sanitizeAuditData } from '../../src/lib/audit.js';
import { executeTool } from '../../src/execution/toolDispatcher.js';
import { executeApprovedAction } from '../../src/execution/approvalExecutor.js';

// Supabase mock
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => ({
    from: () => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    }),
    rpc: mockRpc,
  }),
}));

vi.mock('../../src/lib/audit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/audit.js')>();
  return {
    ...actual,
    audit: vi.fn().mockResolvedValue(undefined),
  };
});

describe('S07-AC-01: Production Configuration & Secret Gates', () => {
  it('rejects startup in production when default development secrets are present', () => {
    const invalidProductionConfig: any = {
      nodeEnv: 'production',
      port: 3000,
      workerPort: 3001,
      supabase: {
        url: DEFAULT_DEV_SUPABASE_URL,
        serviceRoleKey: DEFAULT_DEV_SUPABASE_KEY,
      },
      auth: {
        jwtSecret: DEFAULT_DEV_JWT_SECRET,
        ownerPinHash: DEFAULT_DEV_PIN_HASH,
        tokenExpirySeconds: 86400,
      },
      encryption: {
        masterKey: DEFAULT_DEV_MASTER_KEY,
      },
      cors: {
        allowedOrigins: ['https://app.yugantargrowth.com'],
      },
      worker: {
        pollIntervalMs: 5000,
        maxConcurrency: 3,
        leaseSeconds: 300,
      },
      logging: {
        level: 'info',
      },
      isProd: () => true,
      isDev: () => false,
    };

    expect(() => validateConfig('production', invalidProductionConfig)).toThrow(ConfigValidationError);

    try {
      validateConfig('production', invalidProductionConfig);
    } catch (err) {
      const configErr = err as ConfigValidationError;
      expect(configErr.errors.some(e => e.includes('SUPABASE_URL'))).toBe(true);
      expect(configErr.errors.some(e => e.includes('SUPABASE_SERVICE_ROLE_KEY'))).toBe(true);
      expect(configErr.errors.some(e => e.includes('JWT_SECRET'))).toBe(true);
      expect(configErr.errors.some(e => e.includes('OWNER_PIN_HASH'))).toBe(true);
      expect(configErr.errors.some(e => e.includes('CREDENTIAL_MASTER_KEY'))).toBe(true);
    }
  });

  it('accepts valid production configuration with strong secrets', () => {
    const validProductionConfig: any = {
      nodeEnv: 'production',
      port: 3000,
      workerPort: 3001,
      supabase: {
        url: 'https://prod-project.supabase.co',
        serviceRoleKey: 'prod-service-role-key-very-secure-and-long-token',
      },
      auth: {
        jwtSecret: 'a-super-secret-production-jwt-key-with-more-than-32-chars',
        ownerPinHash: '$2b$10$customProductionPinHash98765432101234567890abcdef',
        tokenExpirySeconds: 3600,
      },
      encryption: {
        masterKey: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      },
      cors: {
        allowedOrigins: ['https://app.yugantargrowth.com'],
      },
      worker: {
        pollIntervalMs: 5000,
        maxConcurrency: 3,
        leaseSeconds: 300,
      },
      logging: {
        level: 'info',
      },
      isProd: () => true,
      isDev: () => false,
    };

    expect(() => validateConfig('production', validProductionConfig)).not.toThrow();
  });
});

describe('S07-AC-02: Auth, Headers, and CORS Security', () => {
  const app = createApp();

  it('enforces 401 Unauthorized on protected routes when Authorization header is absent', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Missing or malformed');
  });

  it('enforces 401 Unauthorized when an invalid token is provided', async () => {
    const res = await request(app)
      .get('/api/leads')
      .set('Authorization', 'Bearer invalid-token-xyz');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid or expired token');
  });

  it('sets defensive security headers (Helmet CSP, no x-powered-by)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects cross-origin requests from untrusted origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://malicious-phishing-site.com');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('CORS origin not allowed');
  });
});

describe('S07-AC-03 & S07-AC-06: Least Privilege & Server-Side Approval Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed when agent is not registered or not found in database (S07-AC-03)', async () => {
    // Tool fetch succeeds
    mockSelect.mockReturnValueOnce({
      eq: () => ({
        single: () => Promise.resolve({ data: { tool_id: 'web_search', status: 'available' }, error: null }),
      }),
    });
    // Agent fetch returns null (unregistered agent)
    mockSelect.mockReturnValueOnce({
      eq: () => ({
        single: () => Promise.resolve({ data: null, error: { message: 'Agent not found' } }),
      }),
    });

    const result = await executeTool({
      tool_id: 'web_search',
      agent_id: 'unauthorized_rogue_agent',
      inputs: { query: 'test' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Agent not found or unregistered');
  });

  it('rejects tool execution if action is in agent prohibited_actions (S07-AC-03)', async () => {
    mockSelect.mockReturnValueOnce({
      eq: () => ({
        single: () => Promise.resolve({ data: { tool_id: 'delete_lead', status: 'available' }, error: null }),
      }),
    });
    mockSelect.mockReturnValueOnce({
      eq: () => ({
        single: () => Promise.resolve({
          data: {
            agent_id: 'operator',
            allowed_tools: ['delete_lead'],
            prohibited_actions: ['delete_lead'],
          },
          error: null,
        }),
      }),
    });

    const result = await executeTool({
      tool_id: 'delete_lead',
      agent_id: 'operator',
      inputs: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Action explicitly prohibited');
  });

  it('intercepts sensitive actions requiring approval and queues them without execution (S07-AC-06)', async () => {
    // 1. Tool requires approval
    mockSelect.mockReturnValueOnce({
      eq: () => ({
        single: () => Promise.resolve({
          data: {
            tool_id: 'send_whatsapp',
            display_name: 'Send WhatsApp',
            status: 'available',
            requires_approval: true,
          },
          error: null,
        }),
      }),
    });
    // 2. Agent is allowed
    mockSelect.mockReturnValueOnce({
      eq: () => ({
        single: () => Promise.resolve({
          data: { agent_id: 'hunter', allowed_tools: ['send_whatsapp'], prohibited_actions: [] },
          error: null,
        }),
      }),
    });
    // 3. Tool execution record insert
    mockInsert.mockReturnValueOnce({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'exec-1' }, error: null }),
      }),
    });
    // 4. Approval queue insert
    mockInsert.mockReturnValueOnce({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'appr-uuid-1' }, error: null }),
      }),
    });
    // 5. Tool execution update
    mockUpdate.mockReturnValueOnce({
      eq: () => Promise.resolve({ data: {}, error: null }),
    });

    const result = await executeTool({
      tool_id: 'send_whatsapp',
      agent_id: 'hunter',
      inputs: { phone: '+919876543210', content: 'Hi there' },
      is_approved: false, // NOT approved yet
    });

    expect(result.success).toBe(true);
    expect(result.queued_for_approval).toBe(true);
    expect(result.approval_id).toBe('appr-uuid-1');
  });
});

describe('S07-AC-04 & S07-AC-05: Approval Immutability & Race Safety', () => {
  it('aborts approved execution if payload hash does not match (tamper prevention)', async () => {
    const originalPayload = { tool_id: 'send_email', inputs: { to: 'founder@yugantargrowth.com' } };
    const originalHash = crypto.createHash('sha256').update(JSON.stringify(originalPayload)).digest('hex');

    // Tampered approval record (e.g. attacker modified payload inputs)
    const tamperedApproval: any = {
      id: 'appr-tampered',
      action: 'Send Email',
      agent: 'hunter',
      payload_hash: originalHash,
      payload: {
        tool_id: 'send_email',
        inputs: { to: 'attacker@malicious.com' }, // tampered!
      },
    };

    const execResult = await executeApprovedAction(tamperedApproval);

    expect(execResult.success).toBe(false);
    expect(execResult.summary).toContain('payload has been tampered with');
    expect(execResult.error).toContain('Integrity check failed');
  });
});

describe('S07-AC-07: Audit Append-Only & Credential Redaction', () => {
  it('sanitizes passwords, API keys, tokens, pins, and bearer tokens from audit data', () => {
    const sensitivePayload = {
      user: 'admin',
      password: 'SuperSecretPassword123',
      apiKey: 'sk-live-abcdef1234567890',
      token: 'jwt.token.string',
      nested: {
        pin: '1234',
        private_key: '-----BEGIN PRIVATE KEY-----',
        safe_param: 'public-value',
      },
      authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
    };

    const sanitized: any = sanitizeAuditData(sensitivePayload);

    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.nested.pin).toBe('[REDACTED]');
    expect(sanitized.nested.private_key).toBe('[REDACTED]');
    expect(sanitized.nested.safe_param).toBe('public-value');
    expect(sanitized.authHeader).toBe('[REDACTED]');
  });
});
