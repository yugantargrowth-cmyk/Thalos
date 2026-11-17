import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import crypto from 'crypto';
import { getSupabase } from '../../lib/supabase.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../middleware/errorHandler.js';
import { executeApprovedAction } from '../../execution/approvalExecutor.js';
import { approvalLimiter } from '../middleware/rateLimit.js';

const router = Router();

// ── List pending approvals ────────────────────────────────────
router.get(
  '/',
  query('status').optional().isIn(['pending','approved','rejected','completed','failed','expired']),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  async (req: Request, res: Response): Promise<void> => {
    const supabase = getSupabase();
    const status = (req.query.status as string) ?? 'pending';
    const limit = (req.query.limit as unknown as number) ?? 50;

    // Expire stale pending approvals before returning
    await supabase.rpc('expire_approvals');

    const { data, error, count } = await supabase
      .from('approval_queue')
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new AppError(500, 'Failed to fetch approvals');
    res.json({ approvals: data, total: count });
  }
);

// ── Get single approval ───────────────────────────────────────
router.get(
  '/:id',
  param('id').isUUID(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Invalid approval ID' });
      return;
    }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('approval_queue')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) throw new AppError(404, 'Approval not found');
    res.json({ approval: data });
  }
);

// ── Approve ───────────────────────────────────────────────────
router.post(
  '/:id/approve',
  approvalLimiter,
  param('id').isUUID(),
  body('execute_immediately').optional().isBoolean(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Invalid approval ID' });
      return;
    }

    const supabase = getSupabase();
    const { data: approval } = await supabase
      .from('approval_queue')
      .select('*')
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .single();

    if (!approval) throw new AppError(404, 'Approval not found or not pending');

    // Check expiry
    if (new Date(approval.expires_at) < new Date()) {
      await supabase.from('approval_queue').update({ status: 'expired' }).eq('id', req.params.id);
      throw new AppError(410, 'Approval has expired — re-request the action');
    }

    // Verify payload integrity
    const currentHash = hashPayload(approval.payload);
    if (currentHash !== approval.payload_hash) {
      throw new AppError(409, 'Approval payload has been tampered with — cannot approve');
    }

    // Atomic single-use transition (R-002, L11-AC-04)
    const { data: updatedApproval, error: updateErr } = await supabase
      .from('approval_queue')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.auth?.sub ?? 'owner',
      })
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (updateErr || !updatedApproval) {
      throw new AppError(409, 'Approval is no longer pending or was processed concurrently');
    }

    await audit({
      event_type: 'approval.approved',
      entity_type: 'approval',
      entity_id: req.params.id,
      actor: req.auth?.sub ?? 'owner',
      description: `Approved: ${approval.action}`,
    });

    // Optionally execute immediately
    const executeNow = req.body.execute_immediately !== false; // default true
    if (executeNow) {
      const execResult = await executeApprovedAction(approval);
      await supabase.from('approval_queue').update({
        status: execResult.success ? 'completed' : 'failed',
        executed_at: new Date().toISOString(),
        execution_result: execResult.summary,
        execution_evidence: execResult.evidence ?? null,
      }).eq('id', req.params.id);

      res.json({
        approval_id: req.params.id,
        status: execResult.success ? 'completed' : 'failed',
        execution: execResult,
      });
      return;
    }

    res.json({ approval_id: req.params.id, status: 'approved' });
  }
);

// ── Reject ────────────────────────────────────────────────────
router.post(
  '/:id/reject',
  approvalLimiter,
  param('id').isUUID(),
  body('reason').isString().trim().isLength({ min: 2, max: 500 }),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const supabase = getSupabase();
    const { data: approval } = await supabase
      .from('approval_queue')
      .select('id, action, status')
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .single();

    if (!approval) throw new AppError(404, 'Approval not found or not pending');

    // Atomic single-use rejection transition (R-002, L11-AC-04)
    const { data: rejectedApproval, error: rejectErr } = await supabase
      .from('approval_queue')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.auth?.sub ?? 'owner',
        rejection_reason: req.body.reason,
      })
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (rejectErr || !rejectedApproval) {
      throw new AppError(409, 'Approval is no longer pending or was processed concurrently');
    }

    await audit({
      event_type: 'approval.rejected',
      entity_type: 'approval',
      entity_id: req.params.id,
      actor: req.auth?.sub ?? 'owner',
      description: `Rejected: ${approval.action}. Reason: ${req.body.reason}`,
    });

    res.json({ approval_id: req.params.id, status: 'rejected' });
  }
);

function hashPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export default router;
