import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Express } from 'express';
import { buildApp } from '../src/app.js';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createCategoriesRepo } from '../src/db/categoriesRepo.js';
import { createDocumentsRepo } from '../src/db/documentsRepo.js';
import { createDocumentTypesRepo } from '../src/db/documentTypesRepo.js';
import { createFileStore } from '../src/storage/fileStore.js';

const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000d49444154789c63000100000005000100020a2d4b000000000049454e44ae426082',
  'hex',
);

const PDF_MIN = Buffer.from(
  '%PDF-1.1\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f \n' +
    'trailer\n<</Root 1 0 R>>\nstartxref\n47\n%%EOF',
);

export interface MakeTestEnvOptions {
  testResetEnabled?: boolean;
}

export function makeTestEnv(opts: MakeTestEnvOptions = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-it-'));
  fs.mkdirSync(path.join(tmp, 'db'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'file'), { recursive: true });
  const db: DB = openDatabase(path.join(tmp, 'db', 'documents.db'));
  runMigrations(db);
  const repo = createDocumentsRepo(db);
  const documentTypesRepo = createDocumentTypesRepo(db);
  const categoriesRepo = createCategoriesRepo(db);
  const store = createFileStore(path.join(tmp, 'file'));
  const app: Express = buildApp({
    repo,
    documentTypesRepo,
    categoriesRepo,
    store,
    testResetEnabled: opts.testResetEnabled,
  });
  return {
    tmp,
    db,
    repo,
    documentTypesRepo,
    categoriesRepo,
    store,
    app,
    cleanup() {
      db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
    fixtures: { PNG_1x1, PDF_MIN },
  };
}
