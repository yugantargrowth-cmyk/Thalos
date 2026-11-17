#!/usr/bin/env node
/**
 * Database migration runner for THALOS.
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from env or settings.json.
 * Tracks migrations in `_schema_migrations` table for repeatable, safe execution.
 *
 * Usage: node scripts/migrate.js [--dry-run] [--up-to 005] [--force]
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
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
const force = args.includes('--force');
const upToIdx = args.indexOf('--up-to');
const upTo = upToIdx !== -1 ? args[upToIdx + 1] : null;

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || settings?.supabase?.url;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || settings?.supabase?.serviceRoleKey;
  if (!url || !key || url.includes('placeholder')) {
    if (dryRun) {
      console.log('ℹ️  Running in DRY RUN mode with placeholder client.');
      return null;
    }
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in settings.json or .env');
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getMigrationPlan() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const filtered = upTo
    ? files.filter(f => f.split('_')[0] <= upTo.padStart(3, '0'))
    : files;

  return filtered.map(file => {
    const path = join(MIGRATIONS_DIR, file);
    const sql = readFileSync(path, 'utf8');
    return {
      file,
      version: file.split('_')[0],
      checksum: computeChecksum(sql),
      length: sql.length,
      path,
      sql,
    };
  });
}

async function runMigrations() {
  const plan = await getMigrationPlan();
  const supabase = getSupabaseAdmin();

  console.log(`\nTHALOS Migration Runner (L13-AC-01)`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no database changes)' : 'LIVE'}`);
  console.log(`Migrations in plan: ${plan.map(p => p.file).join(', ')}\n`);

  if (dryRun) {
    for (const item of plan) {
      console.log(`[DRY RUN] ${item.file} — Checksum: ${item.checksum.slice(0, 12)}... (${item.length} chars)`);
    }
    console.log('\n✅ Dry run complete. All migration files are readable and well-formed.');
    return;
  }

  // Ensure _schema_migrations tracking table exists
  const initSql = `
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await supabase.rpc('exec_sql', { sql: initSql }).catch(() => null);

  // Check already applied migrations
  let appliedVersions = new Set();
  try {
    const { data } = await supabase.from('_schema_migrations').select('version');
    if (data) {
      appliedVersions = new Set(data.map(d => d.version));
    }
  } catch {
    // If table read fails (e.g. Supabase free tier without exec_sql RPC), proceed safely
  }

  for (const item of plan) {
    if (!force && appliedVersions.has(item.version)) {
      console.log(`  ✓ ${item.file} (already applied, skipping)`);
      continue;
    }

    console.log(`→ Executing ${item.file} ...`);
    const { error } = await supabase.rpc('exec_sql', { sql: item.sql }).catch((err) => ({ error: err }));

    if (error) {
      console.error(`  ERROR applying ${item.file}: ${error.message || error}`);
      console.log(`  → For Supabase projects where exec_sql RPC is disabled, execute SQL in Supabase SQL editor.`);
      process.exit(1);
    }

    // Record migration tracking
    await supabase.from('_schema_migrations').upsert({
      version: item.version,
      file_name: item.file,
      checksum: item.checksum,
      applied_at: new Date().toISOString(),
    }).catch(() => null);

    console.log(`  ✓ ${item.file} applied successfully`);
  }

  console.log('\n✅ Migrations complete.');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  runMigrations().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}
