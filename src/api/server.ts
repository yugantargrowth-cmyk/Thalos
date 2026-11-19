import 'dotenv/config';
import type { Server } from 'http';
import { config, validateConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { validateVaultConfig } from '../lib/vault.js';
import { createApp } from './app.js';

let activeServer: Server | null = null;
let isShuttingDown = false;

export async function startServer(port: number = config.port): Promise<Server> {
  // Validate configuration schemas and production guards
  validateConfig();

  // Validate encryption vault before accepting requests
  validateVaultConfig();

  const app = createApp();

  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, () => {
        logger.info(`THALOS API running on port ${port} [${config.nodeEnv}]`);
        activeServer = server;
        resolve(server);
      });

      server.on('error', (err) => {
        logger.error('Server failed to start', { error: err.message });
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function stopServer(): Promise<void> {
  if (!activeServer) return;
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Graceful server shutdown initiated');

  return new Promise((resolve, reject) => {
    // Force close after 10 seconds if connections refuse to drain
    const forceTimer = setTimeout(() => {
      logger.warn('Forcing server close after 10s drain timeout');
      if (activeServer) {
        activeServer.closeAllConnections?.();
      }
      resolve();
    }, 10000);
    forceTimer.unref();

    activeServer!.close((err) => {
      clearTimeout(forceTimer);
      if (err) {
        logger.error('Error during server close', { error: err.message });
        reject(err);
      } else {
        logger.info('THALOS API stopped cleanly');
        activeServer = null;
        isShuttingDown = false;
        resolve();
      }
    });
  });
}

// Register signal handlers for clean container/process shutdown
function registerShutdownSignals(): void {
  const handleSignal = async (signal: string) => {
    logger.info(`Received ${signal}, beginning graceful shutdown...`);
    try {
      await stopServer();
      process.exit(0);
    } catch (err) {
      logger.error(`Error during ${signal} shutdown`, { error: err });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void handleSignal('SIGTERM'));
  process.on('SIGINT', () => void handleSignal('SIGINT'));
}

// Auto-start when run directly
const isDirectRun = process.env.NODE_ENV !== 'test' && (
  !process.argv[1] ||
  process.argv[1].endsWith('server.ts') ||
  process.argv[1].endsWith('server.js')
);

if (isDirectRun) {
  registerShutdownSignals();
  startServer().catch((err) => {
    logger.error('Fatal startup error', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
