import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../lib/logger.js';
import type winston from 'winston';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      id: string;
      log: winston.Logger;
      startTime?: number;
    }
  }
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = (req.headers['x-correlation-id'] || req.headers['x-request-id']) as string | undefined;

  let correlationId: string;
  if (incomingId && typeof incomingId === 'string' && incomingId.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(incomingId)) {
    correlationId = incomingId;
  } else {
    correlationId = uuidv4();
  }

  req.correlationId = correlationId;
  req.id = correlationId;
  req.startTime = Date.now();
  req.log = logger.child({ correlationId });

  res.setHeader('x-correlation-id', correlationId);
  res.setHeader('x-request-id', correlationId);

  // Log on response completion
  res.on('finish', () => {
    const durationMs = req.startTime ? Date.now() - req.startTime : 0;
    const statusCode = res.statusCode;
    const logData = {
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    if (statusCode >= 500) {
      req.log.error('HTTP Request failed', logData);
    } else if (statusCode >= 400) {
      req.log.warn('HTTP Request client error', logData);
    } else {
      req.log.info('HTTP Request completed', logData);
    }
  });

  next();
}
