import winston from 'winston';
import { config } from './config.js';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'key',
  'apikey',
  'api_key',
  'pin',
  'ownerpinhash',
  'owner_pin_hash',
  'authorization',
  'cookie',
  'servicerolekey',
  'service_role_key',
  'masterkey',
  'master_key',
  'jwtsecret',
  'jwt_secret',
]);

export function redactSensitiveData(val: unknown, depth = 0): unknown {
  if (depth > 6 || val === null || val === undefined) return val;

  if (typeof val === 'string') {
    if (val.toLowerCase().startsWith('bearer ')) {
      return 'Bearer [REDACTED]';
    }
    return val;
  }

  if (Array.isArray(val)) {
    return val.map(item => redactSensitiveData(item, depth + 1));
  }

  if (typeof val === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const lower = k.toLowerCase().replace(/[-_]/g, '');
      if (SENSITIVE_KEYS.has(lower) || SENSITIVE_KEYS.has(k.toLowerCase())) {
        copy[k] = '[REDACTED]';
      } else {
        copy[k] = redactSensitiveData(v, depth + 1);
      }
    }
    return copy;
  }

  return val;
}

const redactFormat = winston.format((info) => {
  // Redact only custom metadata keys, preserving level, message, and Winston symbols
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp' || key === 'service') {
      continue;
    }
    const lower = key.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(lower)) {
      info[key] = '[REDACTED]';
    } else {
      info[key] = redactSensitiveData(info[key], 1);
    }
  }

  // Also redact bearer tokens in message if string
  if (typeof info.message === 'string') {
    info.message = info.message.replace(/(bearer\s+)[A-Za-z0-9-_.]+/gi, '$1[REDACTED]');
  }

  return info;
});

const devFormat = printf(({ level, message, timestamp: ts, correlationId, stack, ...meta }) => {
  const cid = correlationId ? ` [cid:${correlationId}]` : '';
  const filteredMeta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof k !== 'symbol' && k !== 'service') {
      filteredMeta[k] = v;
    }
  }
  const metaStr = Object.keys(filteredMeta).length ? ` ${JSON.stringify(filteredMeta)}` : '';
  const errStack = stack ? `\n${stack}` : '';
  return `${ts} ${level}${cid}: ${message}${metaStr}${errStack}`;
});

// Production: structured JSON — never log unredacted bodies or credentials
// Development/test: readable output
const format = config.isProd()
  ? combine(
      redactFormat(),
      timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
      errors({ stack: true }),
      json()
    )
  : combine(
      redactFormat(),
      colorize(),
      timestamp({ format: 'HH:mm:ss' }),
      errors({ stack: true }),
      devFormat
    );

export const logger = winston.createLogger({
  level: config.logging.level,
  format,
  defaultMeta: { service: 'thalos-backend' },
  transports: [new winston.transports.Console({ silent: config.logging.level === 'silent' })],
});

// Sanitise — never log credential values
export function sanitiseError(err: unknown): string {
  if (err instanceof Error) {
    let msg = err.message;
    msg = msg.replace(/(bearer\s+)[A-Za-z0-9-_.]+/gi, '$1[REDACTED]');
    return msg;
  }
  if (typeof err === 'string') {
    return err.replace(/(bearer\s+)[A-Za-z0-9-_.]+/gi, '$1[REDACTED]');
  }
  return 'Unknown error';
}
