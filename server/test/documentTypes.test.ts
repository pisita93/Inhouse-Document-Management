import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createDocumentTypesRepo } from '../src/db/documentTypesRepo.js';
import { makeTestEnv } from './helpers.js';

function setupDb() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-doctypes-'));
  fs.mkdirSync(path.join(tmp, 'db'), { recursive: true });
  const db: DB = openDatabase(path.join(tmp, 'db', 'documents.db'));
  runMigrations(db);
  return {
    db,
    tmp,
    cleanup() {
      db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

describe('documentTypesRepo', () => {
  let env: ReturnType<typeof setupDb>;
  let repo: ReturnType<typeof createDocumentTypesRepo>;

  beforeEach(() => {
    env = setupDb();
    repo = createDocumentTypesRepo(env.db);
  });
  afterEach(() => env.cleanup());

  it('lists seeded types in sort_order', () => {
    const items = repo.list({ includeDisabled: false });
    expect(items).toHaveLength(10);
    expect(items[0]?.id).toBe('invoice');
    expect(items[items.length - 1]?.id).toBe('other');
  });

  it('hides disabled types by default; includeDisabled returns them', () => {
    repo.patch('other', { disabledAt: new Date().toISOString() });
    expect(repo.list({ includeDisabled: false }).map((t) => t.id)).not.toContain('other');
    expect(repo.list({ includeDisabled: true }).map((t) => t.id)).toContain('other');
  });

  it('create + getById', () => {
    repo.create({
      id: 'tax_form',
      label: 'Tax Form',
      requiresFinancial: true,
      sortOrder: 50,
    });
    const got = repo.getById('tax_form');
    expect(got?.requiresFinancial).toBe(true);
  });

  it('patch updates label/sort/disabledAt but not requiresFinancial', () => {
    repo.patch('contract', { label: 'Legal Contract', sortOrder: 35 });
    const got = repo.getById('contract');
    expect(got?.label).toBe('Legal Contract');
    expect(got?.sortOrder).toBe(35);
  });

  it('name uniqueness on create (case-insensitive id)', () => {
    expect(() =>
      repo.create({ id: 'invoice', label: 'X', requiresFinancial: false, sortOrder: 0 }),
    ).toThrow();
  });
});

describe('documentTypes routes', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  it('GET /api/document-types lists enabled types', async () => {
    const res = await request(env.app).get('/api/document-types');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(10);
  });

  it('POST creates a type with requiresFinancial', async () => {
    const res = await request(env.app)
      .post('/api/document-types')
      .send({ id: 'tax_form', label: 'Tax Form', requiresFinancial: true, sortOrder: 55 });
    expect(res.status).toBe(201);
    expect(res.body.requiresFinancial).toBe(true);
  });

  it('PATCH rejects requiresFinancial in body', async () => {
    const res = await request(env.app)
      .patch('/api/document-types/contract')
      .send({ requiresFinancial: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUIRES_FINANCIAL_IMMUTABLE');
  });

  it('PATCH allows rename/disable', async () => {
    const res = await request(env.app)
      .patch('/api/document-types/other')
      .send({ disabledAt: new Date().toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.disabledAt).toBeTruthy();
  });
});
