import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase } from '../../lib/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import { thalosOrchestrate, ActionStatus } from '../../intelligence/orchestrator.js';
import { generateDailyBrief } from '../../intelligence/brief.js';

const router = Router();

/**
 * In-memory fallback conversation cache
 */
interface InMemoryConversation {
  id: string;
  session_date: string;
  messages: any[];
  token_count: number;
}
const inMemoryConversations: Record<string, InMemoryConversation> = {};

/**
 * POST /api/intelligence/chat
 * Main THALOS conversational endpoint with durable message IDs and action status.
 * Body: { message: string, session_date?: string, model?: string, provider?: string }
 */
router.post(
  '/chat',
  body('message').isString().trim().isLength({ min: 1, max: 8000 }),
  body('session_date').optional().isISO8601(),
  body('model').optional().isString().trim(),
  body('provider').optional().isString().trim(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const { message, model, provider } = req.body as { message: string; session_date?: string; model?: string; provider?: string };
    const sessionDate = req.body.session_date ?? new Date().toISOString().split('T')[0];
    const supabase = getSupabase();

    let conversationId = uuidv4();
    let history: Array<{
      message_id?: string;
      role: string;
      content: string;
      timestamp: string;
      action_status?: ActionStatus;
      intent?: string;
      actions_taken?: string[];
      pending_approvals?: string[];
    }> = [];

    // Attempt to load from Supabase or fallback to in-memory
    try {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('session_date', sessionDate)
        .maybeSingle();

      if (conversation) {
        conversationId = conversation.id || conversationId;
        if (conversation.messages && Array.isArray(conversation.messages)) {
          history = conversation.messages;
        }
      } else if (inMemoryConversations[sessionDate]) {
        conversationId = inMemoryConversations[sessionDate].id;
        history = inMemoryConversations[sessionDate].messages;
      }
    } catch {
      if (inMemoryConversations[sessionDate]) {
        conversationId = inMemoryConversations[sessionDate].id;
        history = inMemoryConversations[sessionDate].messages;
      }
    }

    const userMessageId = uuidv4();
    const userTimestamp = new Date().toISOString();

    // Append user message with durable ID
    history.push({
      message_id: userMessageId,
      role: 'user',
      content: message,
      timestamp: userTimestamp,
      action_status: 'none',
    });

    const rawCorr = req.headers['x-correlation-id'] || (req as Request & { correlationId?: string }).correlationId;
    const correlationId = Array.isArray(rawCorr) ? rawCorr[0] : (rawCorr as string | undefined);

    let result: any;
    try {
      result = await thalosOrchestrate({
        message,
        history,
        sessionDate,
        correlationId,
      });
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes('All LLM providers failed') || errStr.includes('not configured')) {
        result = {
          response: `I received your outcome request: "${message}".\n\nNo live LLM provider API key is configured yet. Please open **Execution & Settings → Integrations** to enter your Groq or Gemini API key.\n\nOnce entered, THALOS will execute real-time reasoning and tool dispatching using your selected model.`,
          intent: 'configuration_needed',
          action_status: 'none',
          actions_taken: [],
          pending_approvals: [],
          tokens_used: 0,
          model_used: model ? `${provider || 'custom'}/${model}` : 'local/unconfigured',
        };
      } else {
        throw err;
      }
    }

    const assistantMessageId = uuidv4();
    const assistantTimestamp = new Date().toISOString();
    const actionStatus: ActionStatus =
      result.action_status ||
      (result.pending_approvals?.length > 0
        ? 'pending_approval'
        : result.actions_taken?.some((a: string) => a.startsWith('done:'))
        ? 'completed'
        : result.actions_taken?.some((a: string) => a.startsWith('failed:'))
        ? 'attempted'
        : result.intent === 'multi_step_plan'
        ? 'plan'
        : 'none');

    // Append assistant response with durable message_id and action_status
    history.push({
      message_id: assistantMessageId,
      role: 'assistant',
      content: result.response,
      timestamp: assistantTimestamp,
      action_status: actionStatus,
      ...(result.intent ? { intent: result.intent } : {}),
      ...(result.actions_taken?.length ? { actions_taken: result.actions_taken } : {}),
      ...(result.pending_approvals?.length ? { pending_approvals: result.pending_approvals } : {}),
    });

    // Save history in-memory
    inMemoryConversations[sessionDate] = {
      id: conversationId,
      session_date: sessionDate,
      messages: history,
      token_count: result.tokens_used ?? 0,
    };

    // Save history in Supabase
    try {
      await supabase.from('conversations').upsert({
        id: conversationId,
        session_date: sessionDate,
        messages: history,
        token_count: result.tokens_used ?? 0,
      });
    } catch {
      // Offline fallback preserved in inMemoryConversations
    }

    res.json({
      conversation_id: conversationId,
      message_id: assistantMessageId,
      user_message_id: userMessageId,
      response: result.response,
      intent: result.intent,
      action_status: actionStatus,
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

/**
 * DELETE /api/intelligence/conversations/:date
 * Clears conversation history for a specific date.
 */
router.delete('/conversations/:date', async (req: Request, res: Response): Promise<void> => {
  const date = Array.isArray(req.params.date) ? req.params.date[0] : (req.params.date as string);
  delete inMemoryConversations[date];
  const supabase = getSupabase();
  try {
    await supabase.from('conversations').delete().eq('session_date', date);
  } catch {
    // Offline fallback
  }
  res.json({ success: true, message: `Conversation for ${date} cleared` });
});

/**
 * DELETE /api/intelligence/conversations
 * Clears all conversation history.
 */
router.delete('/conversations', async (req: Request, res: Response): Promise<void> => {
  for (const k of Object.keys(inMemoryConversations)) {
    delete inMemoryConversations[k];
  }
  const supabase = getSupabase();
  try {
    await supabase.from('conversations').delete().neq('session_date', '1970-01-01');
  } catch {
    // Offline fallback
  }
  res.json({ success: true, message: 'All conversation histories cleared' });
});

export default router;
