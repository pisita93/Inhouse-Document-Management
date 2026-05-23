import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { categoriesRouter } from './routes/categories.js';
import { documentsRouter } from './routes/documents.js';
import { documentTypesRouter } from './routes/documentTypes.js';
import { healthRouter } from './routes/health.js';
import { tagsRouter } from './routes/tags.js';
import type { createCategoriesRepo } from './db/categoriesRepo.js';
import type { createDocumentsRepo } from './db/documentsRepo.js';
import type { createDocumentTypesRepo } from './db/documentTypesRepo.js';
import type { createTagsRepo } from './db/tagsRepo.js';
import type { FileStore } from './storage/fileStore.js';

export interface AppDeps {
  repo: ReturnType<typeof createDocumentsRepo>;
  documentTypesRepo: ReturnType<typeof createDocumentTypesRepo>;
  categoriesRepo: ReturnType<typeof createCategoriesRepo>;
  tagsRepo: ReturnType<typeof createTagsRepo>;
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
  app.use('/api/documents', documentsRouter(deps));
  app.use('/api/document-types', documentTypesRouter({ repo: deps.documentTypesRepo }));
  app.use('/api/categories', categoriesRouter({ repo: deps.categoriesRepo }));
  app.use('/api/tags', tagsRouter({ repo: deps.tagsRepo }));
  if (deps.staticDir) {
    app.use(express.static(deps.staticDir));
    app.get('*', (_req, res) => res.sendFile('index.html', { root: deps.staticDir }));
  }
  app.use(errorHandler);
  return app;
}
