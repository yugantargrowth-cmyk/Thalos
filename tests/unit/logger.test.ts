import { describe, it, expect } from 'vitest';
import { redactSensitiveData, sanitiseError } from '../../src/lib/logger.js';

describe('Structured logging and secret redaction (L14-AC-04)', () => {
  it('redacts sensitive keys in objects', () => {
    const input = {
      username: 'founder',
      password: 'super-secret-password',
      apiKey: 'sk-1234567890abcdef',
      pin: '1234',
      token: 'jwt.token.here',
      jwt_secret: 'secret-key',
      metadata: {
        serviceRoleKey: 'supabase-service-key',
        nested: {
          master_key: 'hex-key',
          safeField: 'visible-value',
        },
      },
    };

    const redacted = redactSensitiveData(input) as typeof input;
    expect(redacted.username).toBe('founder');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.pin).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.jwt_secret).toBe('[REDACTED]');
    expect(redacted.metadata.serviceRoleKey).toBe('[REDACTED]');
    expect(redacted.metadata.nested.master_key).toBe('[REDACTED]');
    expect(redacted.metadata.nested.safeField).toBe('visible-value');
  });

  it('redacts bearer tokens in string fields', () => {
    const input = {
      authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
      safeHeader: 'application/json',
    };

    const redacted = redactSensitiveData(input) as typeof input;
    expect(redacted.authHeader).toBe('Bearer [REDACTED]');
    expect(redacted.safeHeader).toBe('application/json');
  });

  it('sanitises error messages containing secrets', () => {
    const err = new Error('Failed to connect with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123');
    const cleaned = sanitiseError(err);
    expect(cleaned).toContain('Bearer [REDACTED]');
    expect(cleaned).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123');
  });
});
