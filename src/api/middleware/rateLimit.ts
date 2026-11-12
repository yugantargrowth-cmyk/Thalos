import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/** General API rate limit — 120 req/min per IP */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many requests — slow down' });
  },
});

/** Auth endpoint — 10 attempts/15 min per IP to slow brute-force */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many auth attempts — try again later' });
  },
});

/**
 * Approval actions — 30 approve/reject per 10 min per IP.
 * Prevents approval spam while allowing normal review throughput.
 * A solo founder reviewing a queue of 20 items has ~20 requests
 * in a session; 30/10min is generous but blocks automated abuse.
 */
export const approvalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many approval actions — wait a moment' });
  },
});

/** File upload — 20 uploads/hour per IP */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Upload limit reached — try again later' });
  },
});
