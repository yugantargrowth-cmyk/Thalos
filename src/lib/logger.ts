import winston from 'winston';
import { config } from './config.js';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

// Production: structured JSON — never log request bodies (may contain credentials)
// Development: human-readable
const format = config.isProd()
  ? combine(timestamp(), errors({ stack: true }), json())
  : combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), simple());

export const logger = winston.createLogger({
  level: config.logging.level,
  format,
  defaultMeta: { service: 'thalos-backend' },
  transports: [new winston.transports.Console()],
});

// Sanitise — never log credential values
export function sanitiseError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}
