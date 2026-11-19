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

const SENSITIVE_KEY_REGEX = /password|secret|token|api_?key|auth|bearer|private_?key|pin|hash|credential|master_?key/i;
const SENSITIVE_VALUE_REGEX = /(Bearer\s+[A-Za-z0-9\-._~+/]+=*)|((api_?key|secret|token|password)=['"]?[A-Za-z0-9\-._~+/]+['"]?)/gi;

export function sanitizeAuditData(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.replace(SENSITIVE_VALUE_REGEX, '$1[REDACTED]');
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditData);
  }
  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = sanitizeAuditData(v);
      }
    }
    return sanitized;
  }
  return value;
}

/** Append an immutable audit entry. Never throws — log and continue on failure (S07-AC-07). */
export async function audit(event: AuditEvent): Promise<void> {
  try {
    const supabase = getSupabase();

    const sanitizedDescription = typeof event.description === 'string'
      ? event.description.replace(SENSITIVE_VALUE_REGEX, '$1[REDACTED]')
      : event.description;

    const sanitizedMetadata = sanitizeAuditData(event.metadata ?? {}) as Record<string, unknown>;

    const { error } = await supabase.from('audit_log').insert({
      event_type: event.event_type,
      entity_type: event.entity_type ?? null,
      entity_id: Array.isArray(event.entity_id) ? event.entity_id[0] : (event.entity_id ?? null),
      agent: event.agent ?? null,
      actor: event.actor ?? 'system',
      description: sanitizedDescription,
      metadata: sanitizedMetadata,
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
