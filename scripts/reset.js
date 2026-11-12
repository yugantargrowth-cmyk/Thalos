#!/usr/bin/env node
/**
 * Database reset script.
 * ⚠️  DESTRUCTIVE — drops all application tables and re-creates from migrations.
 * NEVER run against production. Requires explicit confirmation.
 *
 * Usage: NODE_ENV=development CONFIRM_RESET=yes node scripts/reset.js
 */

import 'dotenv/config';

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Reset must not run in production.');
  process.exit(1);
}

if (process.env.CONFIRM_RESET !== 'yes') {
  console.error('ERROR: Set CONFIRM_RESET=yes to confirm you want to destroy all data.');
  console.error('This action is irreversible.');
  process.exit(1);
}

console.log('⚠️  RESET: This script drops all THALOS tables.');
console.log('For safety, perform this via the Supabase SQL editor using migrations in reverse.');
console.log('');
console.log('To reset manually:');
console.log('  1. Open your Supabase project → SQL Editor');
console.log('  2. Run: DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
console.log('  3. Re-run migrations 001–005 (and 006 after ingestion)');
console.log('');
console.log('Automated reset via API is intentionally not implemented to prevent accidental data loss.');
process.exit(0);
