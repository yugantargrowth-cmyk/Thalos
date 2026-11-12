import { getSupabase } from './supabase.js';
import { logger } from './logger.js';

export interface AuditEvent {
  event_type: string;
  entity_type?: string;
  entity_id?: string | string[];
  agent?: string;
  actor?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
}

/** Append an immutable audit entry. Never throws — log and continue on failure. */
export async function audit(event: AuditEvent): Promise<void> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('audit_log').insert({
      event_type: event.event_type,
      entity_type: event.entity_type ?? null,
      entity_id: Array.isArray(event.entity_id) ? event.entity_id[0] : (event.entity_id ?? null),
      agent: event.agent ?? null,
      actor: event.actor ?? 'system',  // null and undefined both fall back to 'system'
      description: event.description,
      metadata: event.metadata ?? {},
      ip_address: event.ip_address ?? null,
    });
    if (error) {
      logger.error('audit_log insert failed', { error: error.message, event_type: event.event_type });
    }
  } catch (err) {
    // Audit failure must NEVER crash the main operation
    logger.error('audit_log unexpected error', { err });
  }
}
