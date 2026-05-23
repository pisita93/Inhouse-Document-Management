import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createTagsRepo } from '../src/db/tagsRepo.js';
import { makeTestEnv } from './helpers.js';

function setupDb() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-tags-'));
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

function insertDoc(db: DB, id: string): void {
  db.prepare(
    `INSERT INTO documents (
      id, document_name, type, document_date,
      filename, original_name, mime_type, size_bytes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    'Doc',
    'other',
    '2026-05-23',
    `${id}.pdf`,
    'doc.pdf',
    'application/pdf',
    100,
    new Date().toISOString(),
  );
}

describe('tagsRepo', () => {
  let env: ReturnType<typeof setupDb>;
  let repo: ReturnType<typeof createTagsRepo>;

  beforeEach(() => {
    env = setupDb();
    repo = createTagsRepo(env.db);
  });
  afterEach(() => env.cleanup());

  it('upsertByName lowercases and trims; idempotent on repeat', () => {
    const a = repo.upsertByName('  Finance  ');
    expect(a.name).toBe('finance');
    const b = repo.upsertByName('FINANCE');
    expect(b.id).toBe(a.id);
  });

  it('list returns alphabetical', () => {
    repo.upsertByName('zebra');
    repo.upsertByName('alpha');
    repo.upsertByName('mike');
    expect(repo.list({}).map((t) => t.name)).toEqual(['alpha', 'mike', 'zebra']);
  });

  it('list with q filters case-insensitive substring', () => {
    repo.upsertByName('finance');
    repo.upsertByName('financial-report');
    repo.upsertByName('other');
    expect(repo.list({ q: 'fin' }).map((t) => t.name)).toEqual(['finance', 'financial-report']);
  });

  it('rename updates name', () => {
    const t = repo.upsertByName('old');
    const renamed = repo.rename(t.id, 'new');
    expect(renamed?.name).toBe('new');
  });

  it('rename throws on uniqueness conflict', () => {
    const a = repo.upsertByName('alpha');
    repo.upsertByName('beta');
    expect(() => repo.rename(a.id, 'beta')).toThrow();
  });

  it('delete cascades document_tags rows', () => {
    const tag = repo.upsertByName('finance');
    insertDoc(env.db, 'doc-1');
    env.db
      .prepare('INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?)')
      .run('doc-1', tag.id);
    expect(repo.delete(tag.id)).toBe(true);
    const count = env.db
      .prepare('SELECT COUNT(*) AS c FROM document_tags WHERE tag_id = ?')
      .get(tag.id) as { c: number };
    expect(count.c).toBe(0);
  });
});

describe('tags routes', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  it('POST creates a tag (lowercased) and returns 201', async () => {
    const res = await request(env.app).post('/api/tags').send({ name: 'Finance' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('finance');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('POST is idempotent: same name returns same id', async () => {
    const a = await request(env.app).post('/api/tags').send({ name: 'finance' });
    const b = await request(env.app).post('/api/tags').send({ name: 'FINANCE' });
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
  });

  it('GET /api/tags returns alphabetical; q filters', async () => {
    await request(env.app).post('/api/tags').send({ name: 'zebra' });
    await request(env.app).post('/api/tags').send({ name: 'alpha' });
    await request(env.app).post('/api/tags').send({ name: 'finance' });
    const all = await request(env.app).get('/api/tags');
    expect(all.body.items.map((t: { name: string }) => t.name)).toEqual([
      'alpha',
      'finance',
      'zebra',
    ]);
    const filtered = await request(env.app).get('/api/tags').query({ q: 'fin' });
    expect(filtered.body.items.map((t: { name: string }) => t.name)).toEqual(['finance']);
  });

  it('PATCH renames; conflict returns 409 NAME_TAKEN; missing returns 404', async () => {
    const a = await request(env.app).post('/api/tags').send({ name: 'alpha' });
    await request(env.app).post('/api/tags').send({ name: 'beta' });
    const ok = await request(env.app).patch(`/api/tags/${a.body.id}`).send({ name: 'gamma' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('gamma');

    const conflict = await request(env.app).patch(`/api/tags/${a.body.id}`).send({ name: 'beta' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('NAME_TAKEN');

    const missing = await request(env.app)
      .patch('/api/tags/00000000-0000-0000-0000-000000000000')
      .send({ name: 'omega' });
    expect(missing.status).toBe(404);
  });

  it('DELETE returns 204; missing returns 404', async () => {
    const t = await request(env.app).post('/api/tags').send({ name: 'temp' });
    const del = await request(env.app).delete(`/api/tags/${t.body.id}`);
    expect(del.status).toBe(204);
    const again = await request(env.app).delete(`/api/tags/${t.body.id}`);
    expect(again.status).toBe(404);
  });
});
