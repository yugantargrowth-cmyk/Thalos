import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { getSupabase } from '../../lib/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import { thalosOrchestrate } from '../../intelligence/orchestrator.js';
import { generateDailyBrief } from '../../intelligence/brief.js';

const router = Router();

/**
 * POST /api/intelligence/chat
 * Main THALOS conversational endpoint.
 * Body: { message: string, session_date?: string }
 */
router.post(
  '/chat',
  body('message').isString().trim().isLength({ min: 1, max: 8000 }),
  body('session_date').optional().isISO8601(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const { message } = req.body as { message: string; session_date?: string };
    const sessionDate = req.body.session_date ?? new Date().toISOString().split('T')[0];
    const supabase = getSupabase();

    // Load or create today's conversation context
    let { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('session_date', sessionDate)
      .maybeSingle();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ session_date: sessionDate, messages: [] })
        .select()
        .single();
      conversation = newConv;
    }

    const history = (conversation?.messages ?? []) as Array<{
      role: string; content: string; timestamp: string;
    }>;

    // Append user message to history
    history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    // Run orchestrator
    const result = await thalosOrchestrate({ message, history, sessionDate });

    // Append assistant response
    history.push({
      role: 'assistant',
      content: result.response,
      timestamp: new Date().toISOString(),
      ...( result.intent ? { intent: result.intent } : {} ),
      ...( result.actions_taken?.length ? { actions_taken: result.actions_taken } : {} ),
    } as any);

    // Persist updated conversation
    await supabase.from('conversations').update({
      messages: history,
      token_count: (conversation?.token_count ?? 0) + (result.tokens_used ?? 0),
    }).eq('session_date', sessionDate);

    res.json({
      response: result.response,
      intent: result.intent,
      actions_taken: result.actions_taken ?? [],
      pending_approvals: result.pending_approvals ?? [],
      tokens_used: result.tokens_used,
      model_used: result.model_used,
      session_date: sessionDate,
    });
  }
);

/**
 * GET /api/intelligence/brief
 * Returns today's daily brief — generates if not yet created.
 */
router.get('/brief', async (req: Request, res: Response): Promise<void> => {
  const today = new Date().toISOString().split('T')[0];
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from('daily_briefs')
    .select('*')
    .eq('brief_date', today)
    .maybeSingle();

  if (existing) {
    res.json({ brief: existing });
    return;
  }

  // Generate fresh brief
  const brief = await generateDailyBrief(today);
  const { data: saved } = await supabase
    .from('daily_briefs')
    .insert({
      brief_date: today,
      content: brief.content,
      context_snapshot: brief.context_snapshot,
      model_used: brief.model_used,
      token_count: brief.token_count,
    })
    .select()
    .single();

  res.json({ brief: saved });
});

/**
 * GET /api/intelligence/conversations?date=YYYY-MM-DD
 */
router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const date = req.query.date as string | undefined;

  let q = supabase
    .from('conversations')
    .select('session_date, token_count, created_at, updated_at')
    .order('session_date', { ascending: false })
    .limit(30);

  if (date) q = q.eq('session_date', date);

  const { data, error } = await q;
  if (error) throw new AppError(500, 'Failed to fetch conversations');
  res.json({ conversations: data });
});

/**
 * GET /api/intelligence/conversations/:date
 */
router.get('/conversations/:date', async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('session_date', req.params.date)
    .single();

  if (error || !data) throw new AppError(404, 'Conversation not found');
  res.json({ conversation: data });
});

export default router;
