/**
 * Send WhatsApp Tool
 * ─────────────────────────────────────────────────────────────
 * Produces a wa.me link for manual dispatch and logs the attempt.
 * THALOS does not send WhatsApp messages autonomously.
 * Manual tap by founder is always required.
 */

import { getSupabase } from '../../lib/supabase.js';
import { audit } from '../../lib/audit.js';

export async function execute(inputs: Record<string, unknown>): Promise<{ output: unknown; evidence: string }> {
  const phone = inputs.phone as string;
  const content = inputs.content as string;
  const lead_id = inputs.lead_id as string | undefined;
  const context = (inputs.context as string | undefined) ?? '';

  if (!phone?.trim()) throw new Error('phone is required');
  if (!content?.trim()) throw new Error('content is required');

  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) throw new Error('phone must be at least 10 digits');

  // E.164 normalisation for Indian numbers
  let e164 = cleanPhone;
  if (cleanPhone.length === 10) e164 = `91${cleanPhone}`;
  if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) e164 = cleanPhone;

  const waLink = `https://wa.me/${e164}?text=${encodeURIComponent(content)}`;

  const supabase = getSupabase();

  // Log to lead activities if lead_id provided
  if (lead_id) {
    await supabase.from('lead_activities').insert({
      lead_id,
      activity: 'whatsapp_link_generated',
      description: `WhatsApp message prepared for dispatch`,
      agent: (inputs.agent_id as string | undefined) ?? 'hunter',
      metadata: { phone, wa_link: waLink, content_length: content.length, context },
    });
  }

  await audit({
    event_type: 'tool.send_whatsapp',
    entity_type: lead_id ? 'lead' : undefined,
    entity_id: lead_id,
    description: `WhatsApp link generated for ${phone}. Manual dispatch required.`,
    metadata: { phone_e164: e164, lead_id },
  });

  return {
    output: {
      phone_e164: `+${e164}`,
      wa_link: waLink,
      content,
      status: 'link_ready',
      dispatch_method: 'manual',
      note: 'MANUAL DISPATCH REQUIRED. THALOS never sends WhatsApp messages autonomously. ' +
            'Open wa.me link on your device to send.',
    },
    evidence: `WhatsApp dispatch link generated for +${e164}. Content ${content.length} chars. ` +
              `NOT sent — manual tap required at ${new Date().toISOString()}`,
  };
}
