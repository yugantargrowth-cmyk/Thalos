#!/usr/bin/env node
/**
 * Usage: node scripts/hash-pin.js YOUR_PIN
 * Outputs the bcrypt hash to put in OWNER_PIN_HASH
 */

import bcrypt from 'bcrypt';

const pin = process.argv[2];
if (!pin || pin.length < 4) {
  console.error('Usage: node scripts/hash-pin.js YOUR_PIN (min 4 chars)');
  process.exit(1);
}

const hash = await bcrypt.hash(pin, 12);
console.log(hash);
console.log('\nAdd this to your .env as:');
console.log(`OWNER_PIN_HASH=${hash}`);
