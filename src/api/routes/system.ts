import { Router, Request, Response } from 'express';
import { getSupabase } from '../../lib/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import { config } from '../../lib/config.js';
import { executeWorkflow } from '../../execution/workflowRuntime.js';
import { agentService } from '../../intelligence/agentService.js';

const router = Router();

// ── System health ─────────────────────────────────────────────
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const checks: Record<string, { status: string; detail?: string }> = {};

  // DB connectivity
  try {
    const { error } = await supabase.from('system_config').select('key').limit(1);
    checks.database = error ? { status: 'error', detail: error.message } : { status: 'ok' };
  } catch {
    checks.database = { status: 'error', detail: 'Connection failed' };
  }

  // Integration statuses
  try {
    const { data: integrations } = await supabase
      .from('integrations')
      .select('integration_id, status, display_name')
      .neq('status', 'disabled');

    const configured = (integrations ?? []).filter(i => ['configured','connected','tested','operational'].includes(i.status));
    const notConfigured = (integrations ?? []).filter(i => i.status === 'not_configured');

    checks.integrations = {
      status: notConfigured.length === 0 ? 'ok' : 'degraded',
      detail: `${configured.length} configured, ${notConfigured.length} need configuration`,
    };
  } catch {
    checks.integrations = { status: 'unknown' };
  }

  // Job queue
  try {
    const { count: queued } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'queued');
    const { count: dead } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'dead_letter');
    checks.job_queue = {
      status: (dead ?? 0) > 0 ? 'degraded' : 'ok',
      detail: `${queued ?? 0} queued, ${dead ?? 0} dead letter`,
    };
  } catch {
    checks.job_queue = { status: 'unknown' };
  }

  // Pending approvals
  try {
    const { count } = await supabase.from('approval_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    checks.approvals = { status: 'ok', detail: `${count ?? 0} pending` };
  } catch {
    checks.approvals = { status: 'unknown' };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const anyError = Object.values(checks).some(c => c.status === 'error');

  res.status(anyError ? 503 : 200).json({
    status: allOk ? 'healthy' : anyError ? 'degraded' : 'partial',
    version: '1.0.0',
    env: config.nodeEnv,
    checks,
    timestamp: new Date().toISOString(),
  });
});

// ── Agents ────────────────────────────────────────────────────
router.get('/agents', async (_req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('agents')
    .select('agent_id,display_name,version,mission,status,allowed_tools,model_capability,approval_policy,risk_classification,max_steps')
    .order('agent_id');
  if (error) throw new AppError(500, 'Failed to fetch agents');
  res.json({ agents: data });
});

router.get('/agents/:agentId', async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('agent_id', req.params.agentId)
    .single();
  if (error || !data) throw new AppError(404, 'Agent not found');
  res.json({ agent: data });
});

router.patch('/agents/:agentId', async (req: Request, res: Response): Promise<void> => {
  const agentId = String(req.params.agentId);
  try {
    const updated = await agentService.updateAgent(agentId, req.body, req.auth?.sub ?? 'founder');
    res.json({ agent: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found')) throw new AppError(404, msg);
    throw new AppError(400, msg);
  }
});

router.post('/agents/:agentId/delegate', async (req: Request, res: Response): Promise<void> => {
  const toAgent = String(req.params.agentId);
  const { from_agent = 'thalos', task_type, input = {}, context = {}, deadline_seconds, max_steps } = req.body ?? {};
  const rawCorr = req.headers['x-correlation-id'] || (req as Request & { correlationId?: string }).correlationId;
  const correlationId = Array.isArray(rawCorr) ? rawCorr[0] : (rawCorr as string | undefined);

  if (!task_type) {
    throw new AppError(400, 'task_type is required for delegation');
  }

  try {
    const result = await agentService.delegateTask({
      from_agent,
      to_agent: toAgent,
      task_type,
      input,
      context,
      deadline_seconds,
      max_steps,
      correlation_id: correlationId,
    });
    res.json({ delegation: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(500, msg);
  }
});

// ── Tools ─────────────────────────────────────────────────────
router.get('/tools', async (_req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('tools')
    .select('tool_id,display_name,description,category,permission_level,status,unavailable_reason,requires_approval,timeout_seconds,idempotent,success_evidence,failure_evidence')
    .order('category');
  if (error) throw new AppError(500, 'Failed to fetch tools');
  res.json({ tools: data });
});

// ── Workflows ─────────────────────────────────────────────────
router.get('/workflows', async (_req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workflow_definitions')
    .select('workflow_id,display_name,description,trigger_type,approval_required,timeout_seconds,status')
    .order('workflow_id');
  if (error) throw new AppError(500, 'Failed to fetch workflows');
  res.json({ workflows: data });
});

router.get('/workflows/:id/runs', async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('workflow_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new AppError(500, 'Failed to fetch workflow runs');
  res.json({ runs: data });
});

router.post('/workflows/:id/run', async (req: Request, res: Response): Promise<void> => {
  const workflowId = String(req.params.id);
  const { input_data, idempotency_key } = req.body ?? {};
  const rawCorr = req.headers['x-correlation-id'] || (req as Request & { correlationId?: string }).correlationId;
  const correlationId = Array.isArray(rawCorr) ? rawCorr[0] : (rawCorr as string | undefined);

  try {
    const result = await executeWorkflow({
      workflowId,
      inputData: input_data ?? {},
      triggerType: 'manual',
      triggeredBy: req.auth?.sub ?? 'founder',
      idempotencyKey: idempotency_key,
      correlationId,
    });
    res.json({ run: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found')) throw new AppError(404, msg);
    throw new AppError(500, msg);
  }
});

// ── Audit log ─────────────────────────────────────────────────
router.get('/audit', async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const limit = parseInt(req.query.limit as string) || 100;
  const entity_type = req.query.entity_type as string | undefined;

  let q = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 500));

  if (entity_type) q = q.eq('entity_type', entity_type);

  const { data, error, count } = await q;
  if (error) throw new AppError(500, 'Failed to fetch audit log');
  res.json({ events: data, total: count });
});

// ── Config (non-secret values only) ──────────────────────────
router.get('/config', async (_req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('system_config').select('key,value,description').order('key');
  if (error) throw new AppError(500, 'Failed to fetch config');
  res.json({ config: data });
});

export default router;
