import 'express-async-errors';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { config } from '../lib/config.js';
import { validateVaultConfig } from '../lib/vault.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { getSupabase } from '../lib/supabase.js';

// Routes
import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import clientsRoutes from './routes/clients.js';
import financeRoutes from './routes/finance.js';
import knowledgeRoutes from './routes/knowledge.js';
import integrationsRoutes from './routes/integrations.js';
import approvalsRoutes from './routes/approvals.js';
import intelligenceRoutes from './routes/intelligence.js';
import systemRoutes from './routes/system.js';

export function createApp(): Express {
  const app = express();

  // ── Correlation ID & structured request logging ──────────
  app.use(correlationIdMiddleware);

  // ── Security headers ───────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", ...config.cors.allowedOrigins],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.disable('x-powered-by');

  // ── CORS ───────────────────────────────────────────────────
  app.use(cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, mobile apps, same-origin)
      if (!origin) {
        cb(null, true);
        return;
      }
      if (config.cors.allowedOrigins.includes(origin) || config.cors.allowedOrigins.includes('*')) {
        cb(null, true);
      } else {
        cb(new Error(`Origin not allowed: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-request-id'],
  }));

  // ── Body parsing with limits ────────────────────────────────
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // ── Public routes & UI preview ──────────────────────────────
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir, { extensions: ['html'] }));
  app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // ── Unauthenticated health & readiness checks ───────────────
  const healthHandler = (_req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      service: 'thalos-api',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  const readyHandler = async (_req: express.Request, res: express.Response) => {
    const checks: Record<string, string> = {};
    let isReady = true;

    // Check 1: Vault configuration
    try {
      validateVaultConfig();
      checks.vault = 'ok';
    } catch (err) {
      checks.vault = `failed: ${err instanceof Error ? err.message : String(err)}`;
      isReady = false;
    }

    // Check 2: Database connectivity
    try {
      const isPlaceholder = config.supabase.url.includes('placeholder') || config.supabase.serviceRoleKey.includes('placeholder');
      if (isPlaceholder) {
        checks.database = 'skipped (development placeholder)';
      } else {
        const supabase = getSupabase();
        const timeoutPromise = new Promise<{ error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error('Database ping timeout (3000ms)')), 3000)
        );
        const queryPromise = supabase.from('audit_log').select('id', { head: true, count: 'exact' });
        const { error } = await Promise.race([queryPromise, timeoutPromise]) as { error?: { message: string } };
        if (error) {
          checks.database = `error: ${error.message}`;
          isReady = false;
        } else {
          checks.database = 'ok';
        }
      }
    } catch (err) {
      checks.database = `failed: ${err instanceof Error ? err.message : String(err)}`;
      isReady = false;
    }

    const statusCode = isReady ? 200 : 503;
    res.status(statusCode).json({
      status: isReady ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/health/ready', readyHandler);
  app.get('/api/health/ready', readyHandler);
  app.get('/ready', readyHandler);

  // ── Unauthenticated auth routes (with strict limiter) ───────
  app.use('/api/auth', authRoutes);

  // ── Rate limiting for protected API ─────────────────────────
  app.use('/api/', apiLimiter);

  // ── Protected routes ────────────────────────────────────────
  app.use('/api/intelligence', requireAuth, intelligenceRoutes);
  app.use('/api/leads', requireAuth, leadsRoutes);
  app.use('/api/clients', requireAuth, clientsRoutes);
  app.use('/api/finance', requireAuth, financeRoutes);
  app.use('/api/knowledge', requireAuth, knowledgeRoutes);
  app.use('/api/integrations', requireAuth, integrationsRoutes);
  app.use('/api/approvals', requireAuth, approvalsRoutes);
  app.use('/api/system', requireAuth, systemRoutes);

  // ── 404 and error handlers ──────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
