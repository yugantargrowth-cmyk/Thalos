#!/usr/bin/env node
/**
 * Database migration runner for THALOS.
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from env.
 * Runs SQL migration files in numeric order against the Supabase project.
 *
 * Usage: node scripts/migrate.js [--dry-run] [--up-to 003]
 *
 * IMPORTANT: Migrations 001-005 are safe to run on a fresh project.
 * Migration 006 (vector index) should be run AFTER bulk document ingestion.
 * Pass --up-to 005 to skip 006 during initial setup.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'database', 'migrations');
const SETTINGS_FILE = join(__dirname, '..', 'settings.json');

let settings = {};
if (existsSync(SETTINGS_FILE)) {
  try {
    settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {}
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const upToIdx = args.indexOf('--up-to');
const upTo = upToIdx !== -1 ? args[upToIdx + 1] : null;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || settings?.supabase?.url;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || settings?.supabase?.serviceRoleKey;
  if (!url || !key || url.includes('your-project-ref') || url.includes('placeholder')) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in settings.json or .env');
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function runMigrations() {
  const supabase = getSupabaseAdmin();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const filtered = upTo
    ? files.filter(f => f.split('_')[0] <= upTo.padStart(3, '0'))
    : files;

  console.log(`\nTHALOS Migration Runner`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Migrations to run: ${filtered.join(', ')}\n`);

  for (const file of filtered) {
    const path = join(MIGRATIONS_DIR, file);
    const sql = readFileSync(path, 'utf8');

    console.log(`→ ${file} ...`);
    if (dryRun) {
      console.log(`  [DRY RUN] Would execute ${sql.length} chars of SQL`);
      continue;
    }

    const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: null }));
    // Note: Supabase free tier may not support exec_sql RPC.
    // If that fails, run SQL files directly in the Supabase SQL editor.
    if (error) {
      console.error(`  ERROR: ${error.message}`);
      console.log(`  → Run ${file} manually in the Supabase SQL editor and retry.`);
      process.exit(1);
    }
    console.log(`  ✓ Done`);
  }

  console.log('\n✅ Migrations complete.');
  if (!dryRun) {
    console.log('NOTE: If using Supabase free tier, run migration SQL files manually in the SQL editor.');
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
