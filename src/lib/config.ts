import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

export const DEFAULT_DEV_JWT_SECRET = 'thalos-default-development-jwt-secret-key-32-chars';
export const DEFAULT_DEV_PIN_HASH = '$2b$10$oyDvkHdiVuqw.Ghzr.DTDuT7OAbovKJ1LppoZ4/x6lDWr.CdQVnM2'; // PIN: 1234
export const DEFAULT_DEV_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
export const DEFAULT_DEV_SUPABASE_URL = 'https://placeholder.supabase.co';
export const DEFAULT_DEV_SUPABASE_KEY = 'placeholder-service-role-key';

export class ConfigValidationError extends Error {
  constructor(public errors: string[]) {
    super(`Configuration validation failed:\n - ${errors.join('\n - ')}`);
    this.name = 'ConfigValidationError';
  }
}

export interface SettingsFile {
  supabase?: {
    url?: string;
    serviceRoleKey?: string;
    anonKey?: string;
  };
  auth?: {
    pin?: string;
    ownerPinHash?: string;
    jwtSecret?: string;
    tokenExpirySeconds?: number;
  };
  encryption?: {
    masterKey?: string;
  };
  integrations?: {
    groq?: { apiKey?: string; primaryModel?: string };
    gemini?: { apiKey?: string; primaryModel?: string };
    cloudflare?: { accountId?: string; apiKey?: string; primaryModel?: string };
    tavily?: { apiKey?: string };
    resend?: { apiKey?: string; fromEmail?: string };
    searxng?: { baseUrl?: string; secret?: string };
    [key: string]: unknown;
  };
  runtime?: {
    nodeEnv?: string;
    port?: number;
    workerPort?: number;
    workerPollIntervalMs?: number;
    workerMaxConcurrency?: number;
    workerLeaseSeconds?: number;
    allowedOrigins?: string[];
    logLevel?: string;
  };
}

let loadedSettings: SettingsFile = {};

try {
  const settingsPath = path.resolve(process.cwd(), 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    loadedSettings = JSON.parse(raw);
  }
} catch {
  // If parsing fails or file doesn't exist, proceed with env vars & safe defaults
}

function resolveString(envKey: string, settingsVal?: string, fallback: string = ''): string {
  if (process.env[envKey] && process.env[envKey]!.trim() !== '') {
    return process.env[envKey]!.trim();
  }
  if (settingsVal && settingsVal.trim() !== '') {
    return settingsVal.trim();
  }
  return fallback;
}

function resolveNumber(envKey: string, settingsVal?: number, fallback: number = 0): number {
  const envVal = process.env[envKey];
  if (envVal && envVal.trim() !== '') {
    const n = parseInt(envVal, 10);
    if (!isNaN(n)) return n;
  }
  if (typeof settingsVal === 'number' && !isNaN(settingsVal)) {
    return settingsVal;
  }
  return fallback;
}

const rawAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : (loadedSettings.runtime?.allowedOrigins ?? ['http://localhost:5173', 'http://localhost:3000']);

export const config = {
  nodeEnv: resolveString('NODE_ENV', loadedSettings.runtime?.nodeEnv, 'development'),
  port: resolveNumber('PORT', loadedSettings.runtime?.port, 3000),
  workerPort: resolveNumber('WORKER_PORT', loadedSettings.runtime?.workerPort, 3001),

  supabase: {
    url: resolveString('SUPABASE_URL', loadedSettings.supabase?.url, DEFAULT_DEV_SUPABASE_URL),
    serviceRoleKey: resolveString('SUPABASE_SERVICE_ROLE_KEY', loadedSettings.supabase?.serviceRoleKey, DEFAULT_DEV_SUPABASE_KEY),
    anonKey: resolveString('SUPABASE_ANON_KEY', loadedSettings.supabase?.anonKey, ''),
  },

  auth: {
    jwtSecret: resolveString('JWT_SECRET', loadedSettings.auth?.jwtSecret, DEFAULT_DEV_JWT_SECRET),
    ownerPinHash: resolveString('OWNER_PIN_HASH', loadedSettings.auth?.ownerPinHash, DEFAULT_DEV_PIN_HASH),
    tokenExpirySeconds: resolveNumber('JWT_EXPIRY_SECONDS', loadedSettings.auth?.tokenExpirySeconds, 86400), // 24h
  },

  encryption: {
    masterKey: resolveString('CREDENTIAL_MASTER_KEY', loadedSettings.encryption?.masterKey, DEFAULT_DEV_MASTER_KEY),
  },

  cors: {
    allowedOrigins: rawAllowedOrigins,
  },

  searxng: {
    baseUrl: resolveString('SEARXNG_BASE_URL', loadedSettings.integrations?.searxng?.baseUrl, ''),
    secret: resolveString('SEARXNG_SECRET', loadedSettings.integrations?.searxng?.secret, ''),
  },

  worker: {
    pollIntervalMs: resolveNumber('WORKER_POLL_INTERVAL_MS', loadedSettings.runtime?.workerPollIntervalMs, 5000),
    maxConcurrency: resolveNumber('WORKER_MAX_CONCURRENCY', loadedSettings.runtime?.workerMaxConcurrency, 3),
    leaseSeconds: resolveNumber('WORKER_LEASE_SECONDS', loadedSettings.runtime?.workerLeaseSeconds, 300),
  },

  logging: {
    level: resolveString('LOG_LEVEL', loadedSettings.runtime?.logLevel, 'info'),
  },

  integrations: loadedSettings.integrations ?? {},

  isProd: () => (process.env.NODE_ENV || loadedSettings.runtime?.nodeEnv || config.nodeEnv) === 'production',
  isDev: () => (process.env.NODE_ENV || loadedSettings.runtime?.nodeEnv || config.nodeEnv) !== 'production',
};

// Zod schema for general runtime validation
export const runtimeConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']),
  port: z.number().int().min(1).max(65535),
  workerPort: z.number().int().min(1).max(65535),
  supabase: z.object({
    url: z.string().min(1),
    serviceRoleKey: z.string().min(1),
    anonKey: z.string().optional(),
  }),
  auth: z.object({
    jwtSecret: z.string().min(16),
    ownerPinHash: z.string().min(10),
    tokenExpirySeconds: z.number().int().positive(),
  }),
  encryption: z.object({
    masterKey: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Master key must be a 64-character hex string (32 bytes)'),
  }),
  cors: z.object({
    allowedOrigins: z.array(z.string().min(1)).min(1),
  }),
  worker: z.object({
    pollIntervalMs: z.number().int().min(500),
    maxConcurrency: z.number().int().min(1),
    leaseSeconds: z.number().int().min(10),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly', 'silent']),
  }),
});

/**
 * Validates configuration against production guards and schema.
 * Throws ConfigValidationError if in production and any required secrets are missing,
 * weak, or set to placeholder/development defaults (addresses R-001).
 */
export function validateConfig(targetEnv?: string, targetCfg: typeof config = config): void {
  const activeEnv = targetEnv ?? (targetCfg.isProd() ? 'production' : (targetCfg.nodeEnv || 'development'));
  const errors: string[] = [];

  // Basic schema check
  const schemaResult = runtimeConfigSchema.safeParse({
    nodeEnv: activeEnv === 'production' ? 'production' : (activeEnv === 'test' ? 'test' : 'development'),
    port: targetCfg.port,
    workerPort: targetCfg.workerPort,
    supabase: targetCfg.supabase,
    auth: targetCfg.auth,
    encryption: targetCfg.encryption,
    cors: targetCfg.cors,
    worker: targetCfg.worker,
    logging: targetCfg.logging,
  });

  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }

  // Strict production guards (R-001)
  if (activeEnv === 'production') {
    const { url, serviceRoleKey } = targetCfg.supabase;
    if (!url || url === DEFAULT_DEV_SUPABASE_URL || url.includes('placeholder') || url.includes('your-project-ref')) {
      errors.push('SUPABASE_URL must be configured with a valid, non-placeholder production URL');
    }
    if (!serviceRoleKey || serviceRoleKey === DEFAULT_DEV_SUPABASE_KEY || serviceRoleKey.includes('placeholder') || serviceRoleKey.includes('your-service-role-key')) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY must be configured with a valid production key');
    }

    const { jwtSecret, ownerPinHash } = targetCfg.auth;
    if (!jwtSecret || jwtSecret === DEFAULT_DEV_JWT_SECRET || jwtSecret.length < 32 || jwtSecret.includes('generate-')) {
      errors.push('JWT_SECRET must be at least 32 characters and cannot use default/placeholder development secret');
    }
    if (!ownerPinHash || ownerPinHash === DEFAULT_DEV_PIN_HASH || ownerPinHash.includes('bcrypt-hash')) {
      errors.push('OWNER_PIN_HASH must be configured with a custom bcrypt hash and cannot use the default PIN 1234');
    }

    const { masterKey } = targetCfg.encryption;
    if (!masterKey || masterKey === DEFAULT_DEV_MASTER_KEY || masterKey.includes('generate-')) {
      errors.push('CREDENTIAL_MASTER_KEY must be configured with a unique 32-byte hex key and cannot use the development default');
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }
}

/** Update settings.json and synchronize in-memory config immediately */
export function updateSettingsFile(updates: Partial<SettingsFile>): SettingsFile {
  const settingsPath = path.resolve(process.cwd(), 'settings.json');
  let current: SettingsFile = {};
  if (fs.existsSync(settingsPath)) {
    try {
      current = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      current = {};
    }
  }

  const merged: SettingsFile = {
    ...current,
    ...updates,
    supabase: { ...current.supabase, ...updates.supabase },
    auth: { ...current.auth, ...updates.auth },
    encryption: { ...current.encryption, ...updates.encryption },
    integrations: { ...current.integrations, ...updates.integrations },
    runtime: { ...current.runtime, ...updates.runtime },
  };

  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
  loadedSettings = merged;

  if (merged.integrations) {
    config.integrations = { ...config.integrations, ...merged.integrations };
  }
  if (merged.supabase?.url) {
    config.supabase.url = merged.supabase.url;
  }
  if (merged.supabase?.serviceRoleKey) {
    config.supabase.serviceRoleKey = merged.supabase.serviceRoleKey;
  }
  if (merged.supabase?.anonKey !== undefined) {
    config.supabase.anonKey = merged.supabase.anonKey;
  }

  return merged;
}

