import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

let instance: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!instance) {
    instance = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    })
  }
  return instance
}

// Also export as default for our new files
export const supabase = getSupabase()
