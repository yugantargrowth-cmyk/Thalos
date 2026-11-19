import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';
import { config } from '../../lib/config.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = req.correlationId || req.id;
  const logInstance = req.log || logger;

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      correlationId,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Handle CORS rejection cleanly
  if (err.message && err.message.startsWith('Origin not allowed:')) {
    res.status(403).json({
      error: 'CORS origin not allowed',
      correlationId,
    });
    return;
  }

  // Handle body parser payload too large
  if ('type' in err && (err as { type: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: 'Payload too large',
      correlationId,
    });
    return;
  }

  // Unexpected error — log full stack with correlation ID, return sanitized message
  logInstance.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl || req.path,
    method: req.method,
    correlationId,
  });

  const responseBody: Record<string, unknown> = {
    error: 'Internal server error',
    correlationId,
  };

  // In development only, include debugging message
  if (config.isDev()) {
    responseBody.debugMessage = err.message;
  }

  res.status(500).json(responseBody);
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
    correlationId: req.correlationId || req.id,
  });
}
