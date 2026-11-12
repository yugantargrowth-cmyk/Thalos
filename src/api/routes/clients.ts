import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { getSupabase } from '../../lib/supabase.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const status = req.query.status as string | undefined;
  const limit = parseInt(req.query.limit as string) || 50;

  let q = supabase
    .from('clients')
    .select('*, projects(id, name, status, due_date)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);

  const { data, error, count } = await q;
  if (error) throw new AppError(500, 'Failed to fetch clients');
  res.json({ clients: data, total: count });
});

router.get('/:id', param('id').isUUID(), async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('clients')
    .select('*, projects(*, tasks(*))')
    .eq('id', req.params.id)
    .single();

  if (error || !data) throw new AppError(404, 'Client not found');
  res.json({ client: data });
});

router.post(
  '/',
  body('business_name').isString().trim().isLength({ min: 2 }),
  body('contact_name').isString().trim().isLength({ min: 2 }),
  body('phone').isString().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('monthly_value').optional().isNumeric(),
  body('start_date').isISO8601(),
  body('packages').optional().isArray(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const supabase = getSupabase();
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        business_name: req.body.business_name,
        contact_name: req.body.contact_name,
        phone: req.body.phone,
        email: req.body.email ?? null,
        monthly_value: req.body.monthly_value ?? 0,
        start_date: req.body.start_date,
        packages: req.body.packages ?? [],
        converted_from_lead_id: req.body.converted_from_lead_id ?? null,
      })
      .select()
      .single();

    if (error || !client) throw new AppError(500, 'Failed to create client', error?.message);

    // If converting from lead, mark lead as won
    if (req.body.converted_from_lead_id) {
      await supabase.from('leads').update({ stage: 'won' }).eq('id', req.body.converted_from_lead_id);
    }

    await audit({
      event_type: 'client.created',
      entity_type: 'client',
      entity_id: client.id,
      actor: req.auth?.sub ?? 'system',
      description: `Client created: ${client.business_name}`,
    });

    res.status(201).json({ client });
  }
);

router.patch(
  '/:id',
  param('id').isUUID(),
  async (req: Request, res: Response): Promise<void> => {
    const supabase = getSupabase();
    const allowed = ['business_name','contact_name','email','monthly_value','status','packages','notes','tags','deliverable_tracker'];
    const updates: Record<string, unknown> = {};
    for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];

    if (!Object.keys(updates).length) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const { data, error } = await supabase.from('clients').update(updates).eq('id', req.params.id).select().single();
    if (error || !data) throw new AppError(404, 'Client not found');

    await audit({ event_type: 'client.updated', entity_type: 'client', entity_id: data.id, actor: req.auth?.sub ?? 'system', description: `Client updated: ${data.business_name}` });
    res.json({ client: data });
  }
);

export default router;
