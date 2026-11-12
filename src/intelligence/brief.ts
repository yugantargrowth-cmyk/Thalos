import { llmCall } from './llmClient.js';
import { getSupabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

export interface DailyBrief {
  content: string;
  context_snapshot: Record<string, unknown>;
  model_used: string;
  token_count: number;
}

export async function generateDailyBrief(date: string): Promise<DailyBrief> {
  const supabase = getSupabase();

  // Gather business context
  const [leads, clients, approvals, followUps, tasks] = await Promise.all([
    supabase.from('leads').select('stage, name, follow_up_date').neq('stage', 'won').neq('stage', 'lost'),
    supabase.from('clients').select('business_name, monthly_value, status').eq('status', 'active'),
    supabase.from('approval_queue').select('action, created_at').eq('status', 'pending'),
    supabase.from('follow_ups').select('reminder_note, due_date, entity_type').eq('status', 'pending').lte('due_date', date),
    supabase.from('tasks').select('title, status, due_date, priority').eq('status', 'in_progress'),
  ]);

  const stageCounts: Record<string, number> = {};
  for (const l of leads.data ?? []) stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1;
  const mrr = (clients.data ?? []).reduce((s, c) => s + parseFloat(c.monthly_value ?? 0), 0);

  const context = {
    date,
    pipeline: stageCounts,
    active_clients: (clients.data ?? []).length,
    mrr,
    pending_approvals: (approvals.data ?? []).length,
    overdue_follow_ups: (followUps.data ?? []).length,
    active_tasks: (tasks.data ?? []).length,
    today_follow_ups: (followUps.data ?? []).filter(f => f.due_date === date),
    pending_approval_list: (approvals.data ?? []).slice(0, 5).map(a => a.action),
  };

  const prompt = `Generate a concise morning brief for Shlok (founder, Yugantar Growth, Ahmedabad) for ${date}.

Business context:
${JSON.stringify(context, null, 2)}

Format:
## Good morning, Shlok 👋

**Today's focus** (1 sentence)

**Pipeline** (2–3 key numbers)

**Actions needed** (bullet points — only real items from context, do not invent)

**Active tasks** (brief list)

Keep it under 200 words. Direct, specific, no fluff.`;

  try {
    const result = await llmCall(
      [{ role: 'user', content: prompt }],
      { capability: 'fast', max_tokens: 400 }
    );
    return {
      content: result.content,
      context_snapshot: context,
      model_used: `${result.provider}/${result.model}`,
      token_count: result.tokens_used,
    };
  } catch (err) {
    logger.error('Daily brief generation failed', { err });
    return {
      content: `## ${date}\n\nBrief generation failed — check integrations. Use /api/system/health to diagnose.`,
      context_snapshot: context,
      model_used: 'none',
      token_count: 0,
    };
  }
}
