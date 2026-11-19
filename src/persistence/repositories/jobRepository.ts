import { getSupabase } from '../../lib/supabase.js';

export interface JobRow {
  id: string;
  job_type: string;
  status: 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'dead_letter';
  priority: number;
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
  attempt: number;
  max_attempts: number;
  worker_id?: string | null;
  lease_expires_at?: string | null;
  next_attempt_at: string;
  idempotency_key?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export class JobRepository {
  async getById(id: string): Promise<JobRow | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`JobRepository.getById error: ${error.message}`);
    return data as JobRow | null;
  }

  async create(data: {
    job_type: string;
    payload: Record<string, unknown>;
    priority?: number;
    max_attempts?: number;
    idempotency_key?: string;
  }): Promise<JobRow> {
    const supabase = getSupabase();
    const { data: created, error } = await supabase
      .from('jobs')
      .insert({
        job_type: data.job_type,
        payload: data.payload,
        priority: data.priority ?? 5,
        max_attempts: data.max_attempts ?? 3,
        idempotency_key: data.idempotency_key ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(`JobRepository.create error: ${error.message}`);
    return created as JobRow;
  }

  async complete(id: string, result?: Record<string, unknown>): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'completed',
        result: result ?? { completed_at: new Date().toISOString() },
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw new Error(`JobRepository.complete error: ${error.message}`);
  }

  async fail(id: string, errorMessage: string, willRetry: boolean, nextAttemptAt?: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('jobs')
      .update({
        status: willRetry ? 'queued' : 'failed',
        error: errorMessage.slice(0, 1000),
        worker_id: null,
        lease_expires_at: null,
        next_attempt_at: willRetry
          ? (nextAttemptAt ?? new Date(Date.now() + 30000).toISOString())
          : new Date().toISOString(),
        completed_at: willRetry ? null : new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw new Error(`JobRepository.fail error: ${error.message}`);
  }
}

export const jobRepository = new JobRepository();
