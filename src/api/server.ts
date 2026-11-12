import 'express-async-errors';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { validateVaultConfig } from '../lib/vault.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

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

async function bootstrap() {
  // Validate vault before accepting any requests
  validateVaultConfig();

  const app = express();

  // ── Security headers ───────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false, // API-only server — no HTML served
    crossOriginEmbedderPolicy: false,
  }));
  app.disable('x-powered-by');

  // ── CORS ───────────────────────────────────────────────────
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) { cb(null, true); return; } // Postman/server-to-server
      if (config.cors.allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`Origin not allowed: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
  }));

  // ── Body parsing ────────────────────────────────────────────
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // ── Rate limiting ───────────────────────────────────────────
  app.use('/api/', apiLimiter);

  // ── Public routes & UI preview ──────────────────────────────
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir));
  app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  app.use('/api/auth', authRoutes);

  // ── Unauthenticated health check ────────────────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

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

  // ── Start ───────────────────────────────────────────────────
  app.listen(config.port, () => {
    logger.info(`THALOS API running on port ${config.port} [${config.nodeEnv}]`);
  });

  return app;
}

bootstrap().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
