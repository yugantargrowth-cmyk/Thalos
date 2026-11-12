import { Router, Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { getSupabase } from '../../lib/supabase.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

const VALID_STAGES = [
  'new','researching','outreach_drafted','contacted','follow_up',
  'qualified','proposal_sent','negotiating','won','lost','unqualified',
];

// ── List leads ───────────────────────────────────────────────
router.get(
  '/',
  query('stage').optional().isIn(VALID_STAGES),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  query('search').optional().isString().trim(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const supabase = getSupabase();
    const limit = (req.query.limit as unknown as number) ?? 50;
    const offset = (req.query.offset as unknown as number) ?? 0;
    const stage = req.query.stage as string | undefined;
    const search = req.query.search as string | undefined;

    let q = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (stage) q = q.eq('stage', stage);
    if (search) q = q.textSearch('name', search, { type: 'websearch' });

    const { data, error, count } = await q;
    if (error) throw new AppError(500, 'Failed to fetch leads', error.message);

    res.json({ leads: data, total: count, limit, offset });
  }
);

// ── Get single lead with activities ──────────────────────────
router.get(
  '/:id',
  param('id').isUUID(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const supabase = getSupabase();
    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !lead) throw new AppError(404, 'Lead not found');

    const { data: activities } = await supabase
      .from('lead_activities')
      .select('*')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: followUps } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('entity_type', 'lead')
      .eq('entity_id', req.params.id)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

    res.json({ lead, activities: activities ?? [], follow_ups: followUps ?? [] });
  }
);

// ── Create lead ───────────────────────────────────────────────
router.post(
  '/',
  body('name').isString().trim().isLength({ min: 2, max: 200 }),
  body('phone').isString().trim().matches(/^\+?[0-9]{7,15}$/),
  body('source').optional().isString(),
  body('email').optional().isEmail().normalizeEmail(),
  body('industry').optional().isString().trim(),
  body('location').optional().isString().trim(),
  body('website').optional().isURL(),
  body('notes').optional().isString().trim(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const supabase = getSupabase();

    // Deduplication by phone
    const normalised = normalisePhone(req.body.phone);
    const { data: existing } = await supabase
      .from('leads')
      .select('id, name, stage')
      .eq('phone', normalised)
      .maybeSingle();

    if (existing) {
      res.status(409).json({
        error: 'Duplicate phone number',
        existing_lead: { id: existing.id, name: existing.name, stage: existing.stage },
      });
      return;
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        name: req.body.name,
        phone: normalised,
        email: req.body.email ?? null,
        source: req.body.source ?? 'manual',
        industry: req.body.industry ?? null,
        location: req.body.location ?? null,
        website: req.body.website ?? null,
        notes: req.body.notes ?? null,
      })
      .select()
      .single();

    if (error || !lead) throw new AppError(500, 'Failed to create lead', error?.message);

    await audit({
      event_type: 'lead.created',
      entity_type: 'lead',
      entity_id: lead.id,
      actor: req.auth?.sub ?? 'system',
      description: `Lead created: ${lead.name}`,
    });

    res.status(201).json({ lead });
  }
);

// ── Update lead ───────────────────────────────────────────────
router.patch(
  '/:id',
  param('id').isUUID(),
  body('stage').optional().isIn(VALID_STAGES),
  body('notes').optional().isString().trim(),
  body('next_action').optional().isString().trim(),
  body('follow_up_date').optional().isISO8601().toDate(),
  body('assigned_agent').optional().isString(),
  body('score').optional().isInt({ min: 0, max: 100 }),
  body('verified_claims').optional().isObject(),
  body('research_status').optional().isIn(['pending','in_progress','completed','failed']),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const supabase = getSupabase();
    const allowedFields = [
      'stage','notes','next_action','follow_up_date','assigned_agent',
      'score','score_reasons','verified_claims','research_status','tags',
    ];
    const updates: Record<string, unknown> = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !lead) throw new AppError(404, 'Lead not found or update failed');

    // Log stage changes to activity
    if (updates.stage) {
      await supabase.from('lead_activities').insert({
        lead_id: lead.id,
        activity: 'stage_change',
        description: `Stage changed to: ${updates.stage}`,
        agent: req.auth?.sub ?? 'founder',
      });
    }

    await audit({
      event_type: 'lead.updated',
      entity_type: 'lead',
      entity_id: lead.id,
      actor: req.auth?.sub ?? 'system',
      description: `Lead updated: ${lead.name}`,
      metadata: { fields: Object.keys(updates) },
    });

    res.json({ lead });
  }
);

// ── Log activity ──────────────────────────────────────────────
router.post(
  '/:id/activities',
  param('id').isUUID(),
  body('activity').isString().isLength({ min: 2, max: 100 }),
  body('description').isString().isLength({ min: 2, max: 2000 }),
  body('agent').optional().isString(),
  body('metadata').optional().isObject(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const supabase = getSupabase();
    const { data: entry, error } = await supabase
      .from('lead_activities')
      .insert({
        lead_id: req.params.id,
        activity: req.body.activity,
        description: req.body.description,
        agent: req.body.agent ?? req.auth?.sub ?? 'founder',
        metadata: req.body.metadata ?? {},
      })
      .select()
      .single();

    if (error || !entry) throw new AppError(500, 'Failed to log activity', error?.message);

    res.status(201).json({ activity: entry });
  }
);

// ── Import leads from CSV/JSON payload ───────────────────────
router.post(
  '/import',
  body('records').isArray({ min: 1, max: 500 }),
  body('records.*.name').isString().trim().isLength({ min: 2 }),
  body('records.*.phone').isString().trim(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const supabase = getSupabase();
    const records = req.body.records as Array<Record<string, string>>;
    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    for (const r of records) {
      try {
        const phone = normalisePhone(r.phone);
        const { error } = await supabase.from('leads').insert({
          name: r.name,
          phone,
          email: r.email ?? null,
          source: 'import',
          industry: r.industry ?? null,
          location: r.location ?? null,
          notes: r.notes ?? null,
        });
        if (error) {
          if (error.code === '23505') {
            results.skipped++;
          } else {
            results.errors.push(`${r.name}: ${error.message}`);
          }
        } else {
          results.imported++;
        }
      } catch {
        results.errors.push(`${r.name ?? 'unknown'}: unexpected error`);
      }
    }

    await audit({
      event_type: 'leads.bulk_import',
      actor: req.auth?.sub ?? 'system',
      description: `Bulk import: ${results.imported} imported, ${results.skipped} skipped`,
      metadata: results,
    });

    res.status(207).json({ results });
  }
);

// ── Helpers ───────────────────────────────────────────────────
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith('091')) return `+${digits.slice(1)}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

export default router;
