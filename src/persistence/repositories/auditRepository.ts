import { getSupabase } from '../../lib/supabase.js';

export interface AuditLogEntry {
  id?: string;
  event_type: string;
  entity_type?: string | null;
  entity_id?: string | null;
  agent?: string | null;
  actor: string;
  description: string;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  created_at?: string;
}

export class AuditRepository {
  async append(entry: Omit<AuditLogEntry, 'id' | 'created_at'>): Promise<AuditLogEntry> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('audit_log')
      .insert({
        event_type: entry.event_type,
        entity_type: entry.entity_type ?? null,
        entity_id: entry.entity_id ?? null,
        agent: entry.agent ?? null,
        actor: entry.actor,
        description: entry.description,
        metadata: entry.metadata ?? {},
        ip_address: entry.ip_address ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(`AuditRepository.append error: ${error.message}`);
    return data as AuditLogEntry;
  }

  async query(filters?: {
    event_type?: string;
    entity_type?: string;
    entity_id?: string;
    actor?: string;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    const supabase = getSupabase();
    let q = supabase.from('audit_log').select('*');

    if (filters?.event_type) q = q.eq('event_type', filters.event_type);
    if (filters?.entity_type) q = q.eq('entity_type', filters.entity_type);
    if (filters?.entity_id) q = q.eq('entity_id', filters.entity_id);
    if (filters?.actor) q = q.eq('actor', filters.actor);
    if (filters?.limit) q = q.limit(filters.limit);

    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new Error(`AuditRepository.query error: ${error.message}`);
    return (data || []) as AuditLogEntry[];
  }
}

export const auditRepository = new AuditRepository();
