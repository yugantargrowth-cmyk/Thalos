import { getSupabase } from '../../lib/supabase.js';
import { decryptCredential } from '../../lib/vault.js';
import { config } from '../../lib/config.js';

export async function execute(inputs: Record<string, unknown>): Promise<{
  output: unknown; evidence: string;
}> {
  const to = inputs.to as string;
  const subject = inputs.subject as string;
  const html = inputs.html as string;
  const from = (inputs.from as string) ?? (config.integrations as Record<string, any>)?.resend?.fromEmail ?? 'THALOS <noreply@yugantar.in>';

  if (!to || !subject || !html) throw new Error('to, subject, html are required');

  let apiKey = (config.integrations as Record<string, any>)?.resend?.apiKey;

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    const supabase = getSupabase();
    const { data: integration } = await supabase
      .from('integrations')
      .select('metadata, status')
      .eq('integration_id', 'resend')
      .single();

    if (!integration || !['configured','operational'].includes(integration.status)) {
      throw new Error('Resend not configured. Set Resend API key in settings.json or Integrations and verify sender domain.');
    }

    const enc = (integration.metadata as Record<string, string>)?._enc;
    if (!enc) throw new Error('Resend credential not found');
    apiKey = decryptCredential(enc);
  }

  const { default: nodeFetch } = await import('node-fetch');
  const resp = await nodeFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Resend API error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { id: string };

  return {
    output: { message_id: data.id, to, subject },
    evidence: `Email sent via Resend. Message ID: ${data.id} at ${new Date().toISOString()}`,
  };
}
