import { getSupabase } from '../../lib/supabase.js';
import { audit } from '../../lib/audit.js';

const ALLOWED_TABLES = [
  'leads','lead_activities','follow_ups','clients','projects','tasks',
  'documents','knowledge_nodes',
];

export async function execute(inputs: Record<string, unknown>): Promise<{
  output: unknown; evidence: string;
}> {
  const table = inputs.table as string;
  const record = inputs.record as Record<string, unknown>;

  if (!ALLOWED_TABLES.includes(table)) {
    throw new Error(`Table not in allowed write list: ${table}`);
  }
  if (!record || typeof record !== 'object') {
    throw new Error('record must be a non-null object');
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.from(table).insert(record).select().single();

  if (error) throw new Error(`DB insert failed: ${error.message}`);

  await audit({
    event_type: 'tool.save_to_db',
    entity_type: table,
    entity_id: data?.id ?? undefined,
    description: `Record created in ${table}`,
  });

  return {
    output: { id: data?.id, table },
    evidence: `Record ${data?.id} created in ${table} at ${new Date().toISOString()}`,
  };
}
