import 'dotenv/config';
import fs from 'fs';
import path from 'path';

interface SettingsFile {
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
    [key: string]: any;
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

export const config = {
  nodeEnv: resolveString('NODE_ENV', loadedSettings.runtime?.nodeEnv, 'development'),
  port: resolveNumber('PORT', loadedSettings.runtime?.port, 3000),
  workerPort: resolveNumber('WORKER_PORT', loadedSettings.runtime?.workerPort, 3001),

  supabase: {
    url: resolveString('SUPABASE_URL', loadedSettings.supabase?.url, 'https://placeholder.supabase.co'),
    serviceRoleKey: resolveString('SUPABASE_SERVICE_ROLE_KEY', loadedSettings.supabase?.serviceRoleKey, 'placeholder-service-role-key'),
    anonKey: resolveString('SUPABASE_ANON_KEY', loadedSettings.supabase?.anonKey, ''),
  },

  auth: {
    jwtSecret: resolveString('JWT_SECRET', loadedSettings.auth?.jwtSecret, 'thalos-default-development-jwt-secret-key-32-chars'),
    // Default PIN: 1234 -> hash: $2b$10$oyDvkHdiVuqw.Ghzr.DTDuT7OAbovKJ1LppoZ4/x6lDWr.CdQVnM2
    ownerPinHash: resolveString('OWNER_PIN_HASH', loadedSettings.auth?.ownerPinHash, '$2b$10$oyDvkHdiVuqw.Ghzr.DTDuT7OAbovKJ1LppoZ4/x6lDWr.CdQVnM2'),
    tokenExpirySeconds: resolveNumber('JWT_EXPIRY_SECONDS', loadedSettings.auth?.tokenExpirySeconds, 86400), // 24h
  },

  encryption: {
    // 64-char hex string (32 bytes) for AES-256-GCM envelope
    masterKey: resolveString('CREDENTIAL_MASTER_KEY', loadedSettings.encryption?.masterKey, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  },

  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
      : (loadedSettings.runtime?.allowedOrigins ?? ['http://localhost:5173', 'http://localhost:3000'])),
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

  isProd: () => (process.env.NODE_ENV || loadedSettings.runtime?.nodeEnv) === 'production',
  isDev: () => (process.env.NODE_ENV || loadedSettings.runtime?.nodeEnv) !== 'production',
};
