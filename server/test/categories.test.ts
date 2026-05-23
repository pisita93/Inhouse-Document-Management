import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createCategoriesRepo } from '../src/db/categoriesRepo.js';
import { makeTestEnv } from './helpers.js';

function setupDb() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-categories-'));
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

describe('categoriesRepo', () => {
  let env: ReturnType<typeof setupDb>;
  let repo: ReturnType<typeof createCategoriesRepo>;

  beforeEach(() => {
    env = setupDb();
    repo = createCategoriesRepo(env.db);
  });
  afterEach(() => env.cleanup());

  it('list returns empty when no categories exist', () => {
    expect(repo.list({ includeDisabled: false })).toEqual([]);
  });

  it('create + getById returns DTO with generated UUID', () => {
    const dto = repo.create({ name: 'Finance', sortOrder: 10 });
    expect(dto.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(dto.name).toBe('Finance');
    expect(dto.sortOrder).toBe(10);
    expect(dto.disabledAt).toBeNull();
    const got = repo.getById(dto.id);
    expect(got?.name).toBe('Finance');
  });

  it('list orders by sort_order then name; hides disabled by default', () => {
    const a = repo.create({ name: 'Alpha', sortOrder: 20 });
    repo.create({ name: 'Beta', sortOrder: 10 });
    repo.create({ name: 'Gamma', sortOrder: 30 });
    repo.patch(a.id, { disabledAt: new Date().toISOString() });
    expect(repo.list({ includeDisabled: false }).map((c) => c.name)).toEqual(['Beta', 'Gamma']);
    expect(repo.list({ includeDisabled: true }).map((c) => c.name)).toEqual([
      'Beta',
      'Alpha',
      'Gamma',
    ]);
  });

  it('patch renames and updates sortOrder/disabledAt', () => {
    const dto = repo.create({ name: 'Old', sortOrder: 0 });
    const updated = repo.patch(dto.id, { name: 'New', sortOrder: 5 });
    expect(updated?.name).toBe('New');
    expect(updated?.sortOrder).toBe(5);
  });

  it('create rejects duplicate name (case-insensitive)', () => {
    repo.create({ name: 'Finance', sortOrder: 0 });
    expect(() => repo.create({ name: 'finance', sortOrder: 0 })).toThrow();
  });

  it('delete removes the row and returns true; false when missing', () => {
    const dto = repo.create({ name: 'Temp', sortOrder: 0 });
    expect(repo.delete(dto.id)).toBe(true);
    expect(repo.getById(dto.id)).toBeNull();
    expect(repo.delete(dto.id)).toBe(false);
  });
});

describe('categories routes', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  it('GET /api/categories lists active categories', async () => {
    await request(env.app).post('/api/categories').send({ name: 'Finance', sortOrder: 10 });
    await request(env.app).post('/api/categories').send({ name: 'Legal', sortOrder: 20 });
    const res = await request(env.app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { name: string }) => c.name)).toEqual(['Finance', 'Legal']);
  });

  it('POST /api/categories creates and returns 201', async () => {
    const res = await request(env.app)
      .post('/api/categories')
      .send({ name: 'Operations', sortOrder: 5 });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.body.name).toBe('Operations');
  });

  it('POST duplicate name returns 409 NAME_TAKEN', async () => {
    await request(env.app).post('/api/categories').send({ name: 'Finance' });
    const res = await request(env.app).post('/api/categories').send({ name: 'finance' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NAME_TAKEN');
  });

  it('PATCH renames; PATCH on missing id returns 404', async () => {
    const created = await request(env.app)
      .post('/api/categories')
      .send({ name: 'Original', sortOrder: 0 });
    const res = await request(env.app)
      .patch(`/api/categories/${created.body.id}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');

    const missing = await request(env.app)
      .patch('/api/categories/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Nope' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE returns 204 and sets documents.category_id to NULL', async () => {
    const cat = await request(env.app).post('/api/categories').send({ name: 'Temp' });
    const categoryId = cat.body.id as string;

    env.db
      .prepare(
        `INSERT INTO documents (
          id, document_name, type, category_id, document_date,
          filename, original_name, mime_type, size_bytes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'doc-1',
        'Doc',
        'other',
        categoryId,
        '2026-05-23',
        'doc-1.pdf',
        'doc.pdf',
        'application/pdf',
        100,
        new Date().toISOString(),
      );

    const del = await request(env.app).delete(`/api/categories/${categoryId}`);
    expect(del.status).toBe(204);

    const row = env.db.prepare('SELECT category_id FROM documents WHERE id = ?').get('doc-1') as {
      category_id: string | null;
    };
    expect(row.category_id).toBeNull();

    const missing = await request(env.app).delete(`/api/categories/${categoryId}`);
    expect(missing.status).toBe(404);
  });
});
