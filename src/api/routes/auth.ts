import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import { issueToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../../lib/config.js';
import { audit } from '../../lib/audit.js';

// bcrypt is not in package.json yet — using node's crypto for PIN comparison
// We use bcrypt-compatible hash stored in OWNER_PIN_HASH
// npm install bcrypt @types/bcrypt if not present — handled by install script

const router = Router();

/**
 * POST /api/auth/login
 * Body: { pin: string }
 * Returns: { token: string, expires_in: number }
 */
router.post(
  '/login',
  authLimiter,
  body('pin')
    .isString()
    .isLength({ min: 4, max: 20 })
    .withMessage('PIN must be 4–20 characters'),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const { pin } = req.body as { pin: string };
    const pinHash = config.auth.ownerPinHash;

    if (!pinHash) {
      res.status(503).json({ error: 'Auth not configured — set OWNER_PIN_HASH in environment' });
      return;
    }

    // bcrypt compare — constant-time, safe against timing attacks
    let valid = false;
    try {
      valid = await bcrypt.compare(pin, pinHash);
    } catch {
      // If OWNER_PIN_HASH is not a valid bcrypt hash, fail safe
      res.status(503).json({ error: 'Auth configuration error — regenerate OWNER_PIN_HASH' });
      return;
    }

    if (!valid) {
      await audit({
        event_type: 'auth.login_failed',
        actor: 'anonymous',
        description: 'Failed login attempt',
        ip_address: req.ip ?? undefined,
      });
      res.status(401).json({ error: 'Invalid PIN' });
      return;
    }

    const token = issueToken();
    await audit({
      event_type: 'auth.login_success',
      actor: 'owner',
      description: 'Owner logged in',
      ip_address: req.ip ?? undefined,
    });

    res.json({ token, expires_in: config.auth.tokenExpirySeconds });
  }
);

/**
 * POST /api/auth/refresh
 * Requires valid token. Issues a new one.
 */
router.post('/refresh', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const token = issueToken();
  res.json({ token, expires_in: config.auth.tokenExpirySeconds });
});

/**
 * GET /api/auth/me
 * Returns current auth payload
 */
router.get('/me', requireAuth, (req: Request, res: Response): void => {
  res.json({ sub: req.auth!.sub, role: req.auth!.role });
});

export default router;
