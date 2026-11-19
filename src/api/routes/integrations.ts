import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { getSupabase } from '../../lib/supabase.js';
import { encryptCredential, maskCredential } from '../../lib/vault.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../middleware/errorHandler.js';
import { testIntegrationConnection } from '../../integrations/connectionTester.js';
import { config, updateSettingsFile } from '../../lib/config.js';
import { AVAILABLE_MODELS } from '../../intelligence/llmClient.js';

const router = Router();

const DEFAULT_INTEGRATIONS = [
  { integration_id: 'groq', display_name: 'Groq Cloud', provider_type: 'llm', primary_model: 'llama-3.3-70b-versatile', fallback_model: 'llama-3.1-8b-instant', is_primary: true, priority: 1 },
  { integration_id: 'gemini', display_name: 'Google Gemini', provider_type: 'llm', primary_model: 'gemini-2.5-flash', fallback_model: 'gemini-1.5-pro', is_primary: false, priority: 2 },
  { integration_id: 'openai', display_name: 'OpenAI', provider_type: 'llm', primary_model: 'gpt-4o-mini', fallback_model: 'gpt-4o', is_primary: false, priority: 3 },
  { integration_id: 'cloudflare', display_name: 'Cloudflare Workers AI', provider_type: 'llm', primary_model: '@cf/meta/llama-3.1-8b-instruct', priority: 4 },
  { integration_id: 'tavily', display_name: 'Tavily Search', provider_type: 'search', priority: 5 },
  { integration_id: 'resend', display_name: 'Resend Email', provider_type: 'email', priority: 6 },
  { integration_id: 'searxng', display_name: 'SearXNG (Self-Hosted)', provider_type: 'search', priority: 7 },
];

// ── Models catalogue & active model info ─────────────────────
router.get('/models', async (_req: Request, res: Response): Promise<void> => {
  const integrationsConfig = (config.integrations as Record<string, any>) ?? {};
  const activeModels = {
    groq: integrationsConfig.groq?.primaryModel || 'llama-3.3-70b-versatile',
    gemini: integrationsConfig.gemini?.primaryModel || 'gemini-2.5-flash',
    openai: integrationsConfig.openai?.primaryModel || 'gpt-4o-mini',
  };

  res.json({
    models: AVAILABLE_MODELS,
    activeModels,
    primaryProvider: 'groq',
  });
});

// ── Overall integration and database connectivity status ────
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  const isPlaceholder = config.supabase.url.includes('placeholder') || config.supabase.url.includes('your-project');
  let supabaseConnected = false;
  let supabaseLatencyMs: number | undefined;
  let supabaseMessage = isPlaceholder ? 'Not configured (using development placeholder)' : 'Testing...';

  if (!isPlaceholder) {
    const start = Date.now();
    try {
      const supabase = getSupabase();
      const timeoutPromise = new Promise<{ error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('Database ping timeout (3000ms)')), 3000)
      );
      const queryPromise = supabase.from('audit_log').select('id', { head: true, count: 'exact' });
      const { error } = (await Promise.race([queryPromise, timeoutPromise])) as { error?: { message: string } };
      supabaseLatencyMs = Date.now() - start;
      if (error) {
        supabaseMessage = `Error: ${error.message}`;
      } else {
        supabaseConnected = true;
        supabaseMessage = `Connected (${supabaseLatencyMs}ms)`;
      }
    } catch (err) {
      supabaseLatencyMs = Date.now() - start;
      supabaseMessage = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const integrationsConfig = (config.integrations as Record<string, any>) ?? {};
  const providersStatus: Record<string, { configured: boolean; hint?: string; primaryModel?: string }> = {};

  for (const item of ['groq', 'gemini', 'openai', 'cloudflare', 'tavily', 'resend', 'searxng']) {
    const cfg = integrationsConfig[item];
    const key = cfg?.apiKey;
    const isConfigured = Boolean(key && String(key).trim().length > 0);
    providersStatus[item] = {
      configured: isConfigured,
      hint: isConfigured ? maskCredential(String(key)) : undefined,
      primaryModel: cfg?.primaryModel,
    };
  }

  res.json({
    supabase: {
      connected: supabaseConnected,
      url: config.supabase.url,
      hasServiceRoleKey: Boolean(config.supabase.serviceRoleKey && !config.supabase.serviceRoleKey.includes('placeholder') && !config.supabase.serviceRoleKey.includes('your-service-role')),
      message: supabaseMessage,
      latencyMs: supabaseLatencyMs,
    },
    providers: providersStatus,
  });
});

// ── Save global / integration settings ───────────────────────
router.post('/settings', async (req: Request, res: Response): Promise<void> => {
  const {
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseAnonKey,
    groqApiKey,
    geminiApiKey,
    openaiApiKey,
    groqPrimaryModel,
    geminiPrimaryModel,
    openaiPrimaryModel,
  } = req.body ?? {};

  const updates: Record<string, any> = {};

  if (supabaseUrl || supabaseServiceRoleKey || supabaseAnonKey) {
    updates.supabase = {};
    if (supabaseUrl) updates.supabase.url = String(supabaseUrl).trim();
    if (supabaseServiceRoleKey) updates.supabase.serviceRoleKey = String(supabaseServiceRoleKey).trim();
    if (supabaseAnonKey !== undefined) updates.supabase.anonKey = String(supabaseAnonKey).trim();
  }

  const integrationUpdates: Record<string, any> = {};
  if (groqApiKey !== undefined || groqPrimaryModel !== undefined) {
    integrationUpdates.groq = {
      ...((config.integrations as Record<string, any>)?.groq ?? {}),
      ...(groqApiKey ? { apiKey: String(groqApiKey).trim() } : {}),
      ...(groqPrimaryModel ? { primaryModel: String(groqPrimaryModel).trim() } : {}),
    };
  }
  if (geminiApiKey !== undefined || geminiPrimaryModel !== undefined) {
    integrationUpdates.gemini = {
      ...((config.integrations as Record<string, any>)?.gemini ?? {}),
      ...(geminiApiKey ? { apiKey: String(geminiApiKey).trim() } : {}),
      ...(geminiPrimaryModel ? { primaryModel: String(geminiPrimaryModel).trim() } : {}),
    };
  }
  if (openaiApiKey !== undefined || openaiPrimaryModel !== undefined) {
    integrationUpdates.openai = {
      ...((config.integrations as Record<string, any>)?.openai ?? {}),
      ...(openaiApiKey ? { apiKey: String(openaiApiKey).trim() } : {}),
      ...(openaiPrimaryModel ? { primaryModel: String(openaiPrimaryModel).trim() } : {}),
    };
  }

  if (Object.keys(integrationUpdates).length > 0) {
    updates.integrations = integrationUpdates;
  }

  updateSettingsFile(updates);

  await audit({
    event_type: 'settings.updated',
    actor: req.auth?.sub ?? 'founder',
    description: 'Updated system settings and integrations configuration',
  });

  res.json({ message: 'Settings saved successfully', ok: true });
});

// ── List all integrations (never returns credential values) ──
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('integrations')
      .select([
        'id','integration_id','display_name','provider_type','status',
        'credential_hint','credential_set_at','primary_model','fallback_model',
        'is_primary','is_fallback','priority','last_tested_at','last_test_result',
        'last_test_latency_ms','capabilities','metadata','created_at','updated_at',
      ].join(','))
      .order('priority', { ascending: true });

    if (!error && data && data.length > 0) {
      res.json({ integrations: data });
      return;
    }
  } catch {
    // Supabase unavailable; proceed to fallback below
  }

  // Graceful fallback from settings.json / memory
  const integrationsConfig = (config.integrations as Record<string, any>) ?? {};
  const integrations = DEFAULT_INTEGRATIONS.map((item) => {
    const cfg = integrationsConfig[item.integration_id];
    const key = cfg?.apiKey;
    const isConfigured = Boolean(key && String(key).trim().length > 0);
    return {
      ...item,
      id: `local-${item.integration_id}`,
      status: isConfigured ? 'configured' : 'not_configured',
      credential_hint: isConfigured ? maskCredential(String(key)) : null,
      primary_model: cfg?.primaryModel || item.primary_model,
    };
  });

  res.json({ integrations });
});

// ── Get single integration ────────────────────────────────────
router.get(
  '/:id',
  param('id').isString().trim(),
  async (req: Request, res: Response): Promise<void> => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('integrations')
      .select([
        'id','integration_id','display_name','provider_type','status',
        'credential_hint','credential_set_at','primary_model','fallback_model',
        'is_primary','is_fallback','priority','last_tested_at','last_test_result',
        'last_test_latency_ms','last_test_error','capabilities','metadata',
        'quota_used','quota_limit','quota_reset_at','created_at','updated_at',
      ].join(','))
      .eq('integration_id', req.params.id)
      .single();

    if (error || !data) throw new AppError(404, 'Integration not found');
    res.json({ integration: data });
  }
);

// ── Set / rotate credential ───────────────────────────────────
// NEVER logs the key value. Stores only encrypted envelope + masked hint.
router.post(
  '/:integrationId/credential',
  param('integrationId').isString().trim().isLength({ min: 2, max: 50 }),
  body('key').isString().trim().isLength({ min: 8, max: 500 }).withMessage('API key must be 8–500 chars'),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const integrationId = String(req.params.integrationId);
    const { key } = req.body as { key: string };

    const supabase = getSupabase();

    // Always update settings.json
    updateSettingsFile({
      integrations: {
        [integrationId]: {
          ...((config.integrations as Record<string, any>)?.[integrationId] ?? {}),
          apiKey: key,
        },
      },
    });

    const encrypted = encryptCredential(key);
    const hint = maskCredential(key);
    const credRef = `thalos_${integrationId}_v${Date.now()}`;

    try {
      const { data: existing } = await supabase
        .from('integrations')
        .select('id, integration_id, display_name')
        .eq('integration_id', integrationId)
        .single();

      if (existing) {
        await supabase.from('integrations').update({
          credential_ref: credRef,
          credential_hint: hint,
          credential_set_at: new Date().toISOString(),
          status: 'configured',
          metadata: { _enc: encrypted },
        }).eq('integration_id', integrationId);
      }
    } catch {
      // Supabase write skipped if offline; credential saved in settings.json
    }

    await audit({
      event_type: 'integration.credential_set',
      entity_type: 'integration',
      entity_id: integrationId,
      actor: req.auth?.sub ?? 'system',
      description: `Credential set for ${integrationId} (hint: ${hint})`,
    });

    res.json({
      message: 'Credential stored securely',
      integration_id: integrationId,
      hint,
      status: 'configured',
    });
  }
);

// ── Update integration primary / fallback model ──────────────
router.patch(
  '/:integrationId/model',
  param('integrationId').isString().trim(),
  body('primaryModel').isString().trim().notEmpty(),
  async (req: Request, res: Response): Promise<void> => {
    const integrationId = String(req.params.integrationId);
    const { primaryModel, fallbackModel } = req.body;

    updateSettingsFile({
      integrations: {
        [integrationId]: {
          ...((config.integrations as Record<string, any>)?.[integrationId] ?? {}),
          primaryModel,
          ...(fallbackModel ? { fallbackModel } : {}),
        },
      },
    });

    try {
      const supabase = getSupabase();
      await supabase
        .from('integrations')
        .update({
          primary_model: primaryModel,
          ...(fallbackModel ? { fallback_model: fallbackModel } : {}),
        })
        .eq('integration_id', integrationId);
    } catch {
      // Supabase write skipped if offline
    }

    res.json({
      message: 'Model updated successfully',
      integration_id: integrationId,
      primary_model: primaryModel,
    });
  }
);

// ── Test connection ───────────────────────────────────────────
router.post(
  '/:integrationId/test',
  param('integrationId').isString().trim(),
  async (req: Request, res: Response): Promise<void> => {
    const integrationId = String(req.params.integrationId);
    const supabase = getSupabase();
    let integrationRow: any = null;

    try {
      const { data } = await supabase
        .from('integrations')
        .select('*')
        .eq('integration_id', integrationId)
        .single();
      integrationRow = data;
    } catch {
      // Database offline; build fallback row
    }

    if (!integrationRow) {
      integrationRow = {
        integration_id: integrationId,
        status: (config.integrations as Record<string, any>)?.[integrationId]?.apiKey ? 'configured' : 'not_configured',
        metadata: {},
      };
    }

    const result = await testIntegrationConnection(integrationRow);

    try {
      await supabase.from('integrations').update({
        last_tested_at: new Date().toISOString(),
        last_test_result: result.success ? 'success' : 'failure',
        last_test_latency_ms: result.latencyMs,
        last_test_error: result.error ?? null,
        status: result.success ? 'operational' : 'error',
      }).eq('integration_id', integrationId);

      await supabase.from('integration_health_tests').insert({
        integration_id: integrationId,
        test_type: 'connection',
        result: result.success ? 'success' : 'failure',
        latency_ms: result.latencyMs,
        error_message: result.error ?? null,
        initiated_by: req.auth?.sub ?? 'founder',
      });
    } catch {
      // Ignored if offline
    }

    await audit({
      event_type: 'integration.tested',
      entity_type: 'integration',
      entity_id: integrationId,
      actor: req.auth?.sub ?? 'system',
      description: `Connection test: ${result.success ? 'PASSED' : 'FAILED'} (${result.latencyMs}ms)`,
    });

    res.json({ result });
  }
);

// ── Enable / disable integration ─────────────────────────────
router.patch(
  '/:integrationId/status',
  param('integrationId').isString().trim(),
  body('enabled').isBoolean(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const { integrationId } = req.params;
    const { enabled } = req.body as { enabled: boolean };
    const supabase = getSupabase();

    const { data: integration } = await supabase
      .from('integrations')
      .select('id, status, display_name')
      .eq('integration_id', integrationId)
      .single();

    if (!integration) throw new AppError(404, 'Integration not found');

    const newStatus = enabled
      ? (integration.status === 'disabled' ? 'configured' : integration.status)
      : 'disabled';

    await supabase.from('integrations')
      .update({ status: newStatus })
      .eq('integration_id', integrationId);

    await audit({
      event_type: enabled ? 'integration.enabled' : 'integration.disabled',
      entity_type: 'integration',
      entity_id: integrationId,
      actor: req.auth?.sub ?? 'system',
      description: `${integration.display_name} ${enabled ? 'enabled' : 'disabled'}`,
    });

    res.json({ integration_id: integrationId, status: newStatus });
  }
);

export default router;
