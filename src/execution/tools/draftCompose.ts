import { getSupabase } from '../../lib/supabase.js';

export async function executeDraftWhatsApp(inputs: Record<string, unknown>): Promise<{
  output: unknown; evidence: string;
}> {
  const leadId = inputs.lead_id as string;
  const content = inputs.content as string;
  const phone = inputs.phone as string;

  if (!content?.trim()) throw new Error('content is required');

  // Store draft in lead activity — does NOT send
  if (leadId) {
    const supabase = getSupabase();
    await supabase.from('lead_activities').insert({
      lead_id: leadId,
      activity: 'drafted',
      description: `WhatsApp draft created`,
      agent: inputs.agent_id ?? 'hunter',
      metadata: { draft_type: 'whatsapp', content, phone },
    });
  }

  // Generate wa.me link for manual dispatch only
  const cleanPhone = phone?.replace(/\D/g, '') ?? '';
  const waLink = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(content)}`
    : null;

  return {
    output: {
      draft_type: 'whatsapp',
      content,
      phone,
      wa_link: waLink,
      status: 'draft',
      note: 'DRAFT ONLY — not sent. Requires approval before dispatch. wa.me link requires manual tap.',
    },
    evidence: `WhatsApp draft created and queued. NOT sent. Manual dispatch required via wa.me link.`,
  };
}

export async function executeDraftEmail(inputs: Record<string, unknown>): Promise<{
  output: unknown; evidence: string;
}> {
  const to = inputs.to as string;
  const subject = inputs.subject as string;
  const body = inputs.body as string;

  if (!to || !subject || !body) throw new Error('to, subject, and body are required');

  return {
    output: {
      draft_type: 'email',
      to,
      subject,
      body,
      status: 'draft',
      note: 'DRAFT ONLY — not sent. Requires approval before dispatch.',
    },
    evidence: `Email draft created for ${to}. NOT sent. Requires approval.`,
  };
}
