import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Service-role client — bypasses RLS. Never expose to browser.
// All authorization is enforced in route middleware and business logic.
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

export const db = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});
