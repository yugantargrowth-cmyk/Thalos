import { describe, it, expect } from 'vitest';
import { encryptCredential, decryptCredential, maskCredential } from '../../src/lib/vault.js';

describe('Credential Vault', () => {
  it('round-trips a plaintext API key', () => {
    const original = 'gsk_test_key_12345678';
    const enc = encryptCredential(original);
    const dec = decryptCredential(enc);
    expect(dec).toBe(original);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const key = 'same_key_every_time';
    const enc1 = encryptCredential(key);
    const enc2 = encryptCredential(key);
    expect(enc1).not.toBe(enc2);
    expect(decryptCredential(enc1)).toBe(key);
    expect(decryptCredential(enc2)).toBe(key);
  });

  it('throws on tampered ciphertext', () => {
    const enc = encryptCredential('secret');
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] ^= 0xff; // Flip last byte
    const tampered = buf.toString('base64');
    expect(() => decryptCredential(tampered)).toThrow('decryption failed');
  });

  it('throws on truncated envelope', () => {
    expect(() => decryptCredential(Buffer.alloc(10).toString('base64'))).toThrow();
  });

  it('masks short keys as ****', () => {
    expect(maskCredential('abc')).toBe('****');
  });

  it('masks long keys showing first 4 and last 4 chars', () => {
    const masked = maskCredential('gsk_abcdefghijklmnop1234');
    expect(masked).toMatch(/^gsk_\.\.\.1234$/);
  });
});
