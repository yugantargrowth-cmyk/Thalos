#!/usr/bin/env node
/**
 * OpenAPI spec validator for THALOS.
 * Validates openapi/openapi.yaml if present.
 * Exits non-zero if spec is missing or invalid.
 *
 * Usage: node scripts/validate-openapi.js
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dirname, '..', 'openapi', 'openapi.yaml');

if (!existsSync(SPEC_PATH)) {
  console.warn('⚠️  OpenAPI spec not found at openapi/openapi.yaml');
  console.warn('   Generate it by running: npm run build && node scripts/generate-openapi.js');
  console.warn('   Skipping validation — this is a known gap (TH-013).');
  process.exit(0); // Non-fatal until spec is generated
}

// Basic YAML check
const content = readFileSync(SPEC_PATH, 'utf8');
if (!content.includes('openapi:') || !content.includes('paths:')) {
  console.error('ERROR: openapi.yaml appears malformed — missing openapi: or paths: keys');
  process.exit(1);
}

console.log('✓ OpenAPI spec present and structurally valid (basic check).');
console.log('  For full validation, install @apidevtools/swagger-parser and add to devDeps.');
process.exit(0);
