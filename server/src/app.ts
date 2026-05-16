import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { receiptsRouter } from './routes/receipts.js';
import { healthRouter } from './routes/health.js';
import type { createReceiptsRepo } from './db/receiptsRepo.js';
import type { FileStore } from './storage/fileStore.js';

export interface AppDeps {
  repo: ReturnType<typeof createReceiptsRepo>;
  store: FileStore;
  staticDir?: string;
  testResetEnabled?: boolean;
}

export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use('/api/health', healthRouter());
  if (deps.testResetEnabled) {
    app.post('/api/test/reset', async (_req, res, next) => {
      try {
        deps.repo.reset();
        await deps.store.reset();
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });
  }
  app.use('/api/receipts', receiptsRouter(deps));
  if (deps.staticDir) {
    app.use(express.static(deps.staticDir));
    app.get('*', (_req, res) => res.sendFile('index.html', { root: deps.staticDir }));
  }
  app.use(errorHandler);
  return app;
}
