import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { getSupabase } from '../../lib/supabase.js';
import { encryptCredential, maskCredential } from '../../lib/vault.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../middleware/errorHandler.js';
import { testIntegrationConnection } from '../../integrations/connectionTester.js';

const router = Router();

// ── List all integrations (never returns credential values) ──
router.get('/', async (_req: Request, res: Response): Promise<void> => {
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

  if (error) throw new AppError(500, 'Failed to fetch integrations');
  res.json({ integrations: data });
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

    const { integrationId } = req.params;
    const { key } = req.body as { key: string };

    const supabase = getSupabase();

    // Verify integration exists
    const { data: existing } = await supabase
      .from('integrations')
      .select('id, integration_id, display_name')
      .eq('integration_id', integrationId)
      .single();

    if (!existing) throw new AppError(404, `Integration not found: ${integrationId}`);

    // Encrypt and store — never store plaintext
    const encrypted = encryptCredential(key);
    const hint = maskCredential(key);
    const credRef = `thalos_${integrationId}_v${Date.now()}`;

    const { error } = await supabase.from('integrations').update({
      credential_ref: credRef,
      credential_hint: hint,
      credential_set_at: new Date().toISOString(),
      status: 'configured',
      // Store encrypted key in metadata._enc.
      // In production: prefer Supabase Vault (vault.create_secret) and store only the vault_id here.
      metadata: { _enc: encrypted },
    }).eq('integration_id', integrationId);

    // Note: In this implementation the encrypted key is stored in integrations.metadata._enc
    // If Supabase Vault is available on your plan, use vault.create_secret() instead
    // and store only the vault_id in credential_ref. The _enc approach is a fallback.

    if (error) throw new AppError(500, 'Failed to store credential');

    await audit({
      event_type: 'integration.credential_set',
      entity_type: 'integration',
      entity_id: integrationId,
      actor: req.auth?.sub ?? 'system',
      description: `Credential set for ${existing.display_name} (hint: ${hint})`,
      // Never include the key or encrypted value in audit
    });

    res.json({
      message: 'Credential stored securely',
      integration_id: integrationId,
      hint,
      status: 'configured',
    });
  }
);

// ── Test connection ───────────────────────────────────────────
router.post(
  '/:integrationId/test',
  param('integrationId').isString().trim(),
  async (req: Request, res: Response): Promise<void> => {
    const { integrationId } = req.params;
    const supabase = getSupabase();

    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('integration_id', integrationId)
      .single();

    if (!integration) throw new AppError(404, 'Integration not found');
    if (integration.status === 'not_configured') {
      res.status(400).json({ error: 'No credential configured — set credential first' });
      return;
    }

    const result = await testIntegrationConnection(integration);

    // Update integration status and last test fields
    await supabase.from('integrations').update({
      last_tested_at: new Date().toISOString(),
      last_test_result: result.success ? 'success' : 'failure',
      last_test_latency_ms: result.latencyMs,
      last_test_error: result.error ?? null,
      status: result.success ? 'operational' : 'error',
    }).eq('integration_id', integrationId);

    // Log to health test history
    await supabase.from('integration_health_tests').insert({
      integration_id: integrationId,
      test_type: 'connection',
      result: result.success ? 'success' : 'failure',
      latency_ms: result.latencyMs,
      error_message: result.error ?? null,
      initiated_by: req.auth?.sub ?? 'founder',
    });

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
