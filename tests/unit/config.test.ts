import { describe, it, expect } from 'vitest';
import {
  config,
  validateConfig,
  ConfigValidationError,
  runtimeConfigSchema,
  DEFAULT_DEV_JWT_SECRET,
  DEFAULT_DEV_PIN_HASH,
  DEFAULT_DEV_MASTER_KEY,
  DEFAULT_DEV_SUPABASE_URL,
  DEFAULT_DEV_SUPABASE_KEY,
} from '../../src/lib/config.js';

describe('Config schema and validation (L14-AC-02)', () => {
  it('validates active config schema successfully', () => {
    const parsed = runtimeConfigSchema.safeParse({
      nodeEnv: 'test',
      port: config.port,
      workerPort: config.workerPort,
      supabase: config.supabase,
      auth: config.auth,
      encryption: config.encryption,
      cors: config.cors,
      worker: config.worker,
      logging: config.logging,
    });
    expect(parsed.success).toBe(true);
  });

  it('allows safe defaults in development and test environments', () => {
    expect(() => validateConfig('development')).not.toThrow();
    expect(() => validateConfig('test')).not.toThrow();
  });

  it('rejects invalid ports or malformed hex master keys in schema', () => {
    const invalid = runtimeConfigSchema.safeParse({
      nodeEnv: 'development',
      port: 999999, // invalid port
      workerPort: config.workerPort,
      supabase: config.supabase,
      auth: config.auth,
      encryption: { masterKey: 'not-a-64-char-hex-string' },
      cors: config.cors,
      worker: config.worker,
      logging: config.logging,
    });
    expect(invalid.success).toBe(false);
  });

  it('strictly rejects default development secrets in production (R-001 fail-closed guard)', () => {
    const devFallbackConfig: typeof config = {
      ...config,
      nodeEnv: 'production',
      supabase: {
        url: DEFAULT_DEV_SUPABASE_URL,
        serviceRoleKey: DEFAULT_DEV_SUPABASE_KEY,
        anonKey: '',
      },
      auth: {
        jwtSecret: DEFAULT_DEV_JWT_SECRET,
        ownerPinHash: DEFAULT_DEV_PIN_HASH,
        tokenExpirySeconds: 86400,
      },
      encryption: {
        masterKey: DEFAULT_DEV_MASTER_KEY,
      },
      isProd: () => true,
      isDev: () => false,
    };

    expect(() => validateConfig('production', devFallbackConfig)).toThrow(ConfigValidationError);

    try {
      validateConfig('production', devFallbackConfig);
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      const valErr = err as ConfigValidationError;
      expect(valErr.errors.some(e => e.includes('SUPABASE_URL'))).toBe(true);
      expect(valErr.errors.some(e => e.includes('SUPABASE_SERVICE_ROLE_KEY'))).toBe(true);
      expect(valErr.errors.some(e => e.includes('JWT_SECRET'))).toBe(true);
      expect(valErr.errors.some(e => e.includes('OWNER_PIN_HASH'))).toBe(true);
      expect(valErr.errors.some(e => e.includes('CREDENTIAL_MASTER_KEY'))).toBe(true);
    }
  });

  it('passes production validation when real, secure credentials are provided', () => {
    const validProdConfig: typeof config = {
      ...config,
      nodeEnv: 'production',
      supabase: {
        url: 'https://real-prod-ref.supabase.co',
        serviceRoleKey: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real-production-service-role-key-secret',
        anonKey: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real-anon-key',
      },
      auth: {
        jwtSecret: 'super-secret-random-production-jwt-key-with-high-entropy-64-bytes',
        ownerPinHash: '$2b$10$EIX8A5R5z4q7lHh1p0C.4Ob1Xy3o8xP9bJ9u1m3mQ0rO9tK6r2m2', // non-default hash
        tokenExpirySeconds: 3600,
      },
      encryption: {
        masterKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'.split('').reverse().join(''), // distinct 64-char hex
      },
      isProd: () => true,
      isDev: () => false,
    };

    expect(() => validateConfig('production', validProdConfig)).not.toThrow();
  });
});
