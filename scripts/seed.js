#!/usr/bin/env node
/**
 * Seed script — inserts safe demonstration data for local development.
 * NEVER run against production. This creates example leads/tasks only.
 *
 * Usage: NODE_ENV=development node scripts/seed.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = join(__dirname, '..', 'settings.json');

let settings = {};
if (existsSync(SETTINGS_FILE)) {
  try {
    settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {}
}

const url = process.env.SUPABASE_URL || settings?.supabase?.url;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || settings?.supabase?.serviceRoleKey;

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Seed script must not run in production.');
  process.exit(1);
}

if (!url || !key || url.includes('placeholder')) {
  console.error('ERROR: Valid SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in settings.json or .env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function seed() {
  console.log('Seeding development data...\n');

  const { data: lead, error: leadErr } = await supabase.from('leads').upsert({
    name: 'Demo Business Pvt Ltd',
    phone: '+919876543210',
    contact_name: 'Demo Contact',
    email: 'demo@example.com',
    source: 'manual',
    stage: 'new',
    industry: 'Retail',
    location: 'Ahmedabad',
    notes: 'Demo lead for local testing. Delete before production.',
  }, { onConflict: 'phone' }).select().single();

  if (leadErr) console.warn('Lead seed skipped:', leadErr.message);
  else console.log(`✓ Demo lead: ${lead.id}`);

  console.log('\n✅ Seed complete. Remove demo data before going to production.');
}

seed().catch(err => { console.error(err.message); process.exit(1); });
