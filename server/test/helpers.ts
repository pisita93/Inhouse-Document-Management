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
import { createTagsRepo } from '../src/db/tagsRepo.js';
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

// Minimal RIFF/WAVE header → file-type detects audio/wav.
const WAV_MIN = Buffer.from(
  '52494646' +
    '24000000' +
    '57415645' +
    '666d7420' +
    '10000000' +
    '01000100' +
    '44ac0000' +
    '10b10200' +
    '04001000' +
    '64617461' +
    '00000000',
  'hex',
);

// MPEG-1 Layer III frame sync (0xFFFB) → file-type detects audio/mpeg.
const MP3_MIN = Buffer.from('fffb90640000000000000000000000000000', 'hex');

// ISO-BMFF ftyp box, brand 'M4A ' → file-type detects audio/x-m4a.
const M4A_MIN = Buffer.from(
  '00000020' +
    '66747970' +
    '4d344120' +
    '00000200' +
    '4d344120' +
    '6d703432' +
    '69736f6d' +
    '00000000',
  'hex',
);

// ISO-BMFF ftyp box, brand 'isom' → file-type detects video/mp4.
const MP4_MIN = Buffer.from(
  '00000020' +
    '66747970' +
    '69736f6d' +
    '00000200' +
    '69736f6d' +
    '69736f32' +
    '6d703431' +
    '00000000',
  'hex',
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
  const tagsRepo = createTagsRepo(db);
  const store = createFileStore(path.join(tmp, 'file'));
  const app: Express = buildApp({
    repo,
    documentTypesRepo,
    categoriesRepo,
    tagsRepo,
    store,
    testResetEnabled: opts.testResetEnabled,
  });
  return {
    tmp,
    db,
    repo,
    documentTypesRepo,
    categoriesRepo,
    tagsRepo,
    store,
    app,
    cleanup() {
      db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
    fixtures: { PNG_1x1, PDF_MIN, WAV_MIN, MP3_MIN, M4A_MIN, MP4_MIN },
  };
}
