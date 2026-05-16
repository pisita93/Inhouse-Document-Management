import fs from 'node:fs';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrations.js';
import { createReceiptsRepo } from './db/receiptsRepo.js';
import { createFileStore } from './storage/fileStore.js';
import { buildApp } from './app.js';
import path from 'node:path';

function assertWritable(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.write-probe-${process.pid}`);
  fs.writeFileSync(probe, '');
  fs.unlinkSync(probe);
}

function main(): void {
  const cfg = loadConfig(process.env);
  logger.info({ port: cfg.port, dataDir: cfg.dataDir }, 'starting');

  assertWritable(cfg.fileRoot);
  assertWritable(path.dirname(cfg.dbPath));

  const db = openDatabase(cfg.dbPath);
  runMigrations(db);
  const repo = createReceiptsRepo(db);
  const store = createFileStore(cfg.fileRoot);

  const staticDir = path.resolve(process.cwd(), 'client/dist');
  const app = buildApp({
    repo,
    store,
    staticDir: fs.existsSync(staticDir) ? staticDir : undefined,
  });

  const server = app.listen(cfg.port, () => {
    logger.info({ port: cfg.port }, 'listening');
  });

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.info({ sig }, 'shutting down');
      server.close(() => {
        db.close();
        process.exit(0);
      });
    });
  }
}

main();
