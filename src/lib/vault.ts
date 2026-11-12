/**
 * Credential Vault
 * ─────────────────────────────────────────────────────────────
 * Provider API keys are NEVER stored in plaintext.
 * Keys are encrypted with AES-256-GCM before writing to Supabase.
 * The master key lives in CREDENTIAL_MASTER_KEY (env var, never DB).
 *
 * Threat model: DB leak reveals only ciphertext. Master key must be
 * separately protected (env var, Fly secrets, Railway secrets, etc.)
 *
 * This vault is an envelope encryption fallback.
 * If Supabase Vault (Vault extension) is available on your plan,
 * prefer vault.encrypt / vault.decrypt instead and set
 * USE_SUPABASE_VAULT=true in env.
 */

import crypto from 'crypto';
import { config } from './config.js';
import { logger } from './logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const _KEY_BYTES = 32;

function getMasterKey(): Buffer {
  const hex = config.encryption.masterKey;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'CREDENTIAL_MASTER_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  return Buffer.from(hex, 'hex');
}

/** Encrypt a plaintext string. Returns base64-encoded ciphertext envelope. */
export function encryptCredential(plaintext: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;

  const ciphertextBuf = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Envelope: iv(12) + tag(16) + ciphertext
  const envelope = Buffer.concat([iv, tag, ciphertextBuf]);
  return envelope.toString('base64');
}

/** Decrypt an envelope produced by encryptCredential. Returns plaintext. */
export function decryptCredential(envelope: string): string {
  const key = getMasterKey();
  const buf = Buffer.from(envelope, 'base64');

  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Invalid credential envelope: too short');
  }

  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Do NOT log the error — it might leak timing or key info
    throw new Error('Credential decryption failed — invalid key or tampered envelope');
  }
}

/** Build a masked hint for display: first 4 + last 4 chars, rest as dots */
export function maskCredential(plaintext: string): string {
  if (plaintext.length <= 8) return '****';
  return plaintext.slice(0, 4) + '...' + plaintext.slice(-4);
}

/** Validate master key is set and correctly formatted (call at startup) */
export function validateVaultConfig(): void {
  try {
    getMasterKey();
    // Smoke-test round-trip
    const test = 'vault_smoke_test';
    const enc = encryptCredential(test);
    const dec = decryptCredential(enc);
    if (dec !== test) throw new Error('Round-trip mismatch');
    logger.info('Credential vault initialised successfully');
  } catch (err) {
    logger.error('Credential vault initialisation failed', { err });
    throw err;
  }
}
