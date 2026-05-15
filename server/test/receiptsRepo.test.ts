import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createReceiptsRepo } from '../src/db/receiptsRepo.js';

const sample = {
  id: '11111111-1111-4111-8111-111111111111',
  documentName: 'AWS January',
  type: 'invoice' as const,
  invoiceDate: '2026-01-15',
  amount: 12500,
  currency: 'THB' as const,
  note: 'monthly',
  filename: '11111111-1111-4111-8111-111111111111.pdf',
  originalName: 'aws-jan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: '2026-01-15T10:00:00.000Z',
};

describe('receiptsRepo', () => {
  let tmpDir: string;
  let db: DB;
  let repo: ReturnType<typeof createReceiptsRepo>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
    db = openDatabase(path.join(tmpDir, 'test.db'));
    runMigrations(db);
    repo = createReceiptsRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('insert + getById roundtrip', () => {
    repo.insert(sample);
    const back = repo.getById(sample.id);
    expect(back).toMatchObject(sample);
  });

  it('getById returns null for unknown id', () => {
    expect(repo.getById('22222222-2222-4222-8222-222222222222')).toBeNull();
  });

  it('list returns most-recent first', () => {
    repo.insert({ ...sample, id: 'a'.repeat(8) + '-1111-4111-8111-111111111111', invoiceDate: '2026-01-01' });
    repo.insert({ ...sample, id: 'b'.repeat(8) + '-1111-4111-8111-111111111111', invoiceDate: '2026-03-01' });
    const { items, total } = repo.list({ page: 1, pageSize: 20 });
    expect(total).toBe(2);
    expect(items[0]?.invoiceDate).toBe('2026-03-01');
  });

  it('list filters by type', () => {
    repo.insert({ ...sample, id: 'c'.repeat(8) + '-1111-4111-8111-111111111111', type: 'receipt' });
    repo.insert({ ...sample, id: 'd'.repeat(8) + '-1111-4111-8111-111111111111', type: 'invoice' });
    const { total } = repo.list({ type: 'invoice', page: 1, pageSize: 20 });
    expect(total).toBe(1);
  });

  it('list filters by date range', () => {
    repo.insert({ ...sample, id: 'e'.repeat(8) + '-1111-4111-8111-111111111111', invoiceDate: '2026-01-01' });
    repo.insert({ ...sample, id: 'f'.repeat(8) + '-1111-4111-8111-111111111111', invoiceDate: '2026-06-01' });
    const { total } = repo.list({ dateFrom: '2026-03-01', dateTo: '2026-12-31', page: 1, pageSize: 20 });
    expect(total).toBe(1);
  });

  it('list searches FTS by q', () => {
    repo.insert({ ...sample, id: 'a1'.padEnd(8, '0') + '-1111-4111-8111-111111111111', documentName: 'AWS January' });
    repo.insert({ ...sample, id: 'a2'.padEnd(8, '0') + '-1111-4111-8111-111111111111', documentName: 'GitHub bill' });
    const { items, total } = repo.list({ q: 'AWS', page: 1, pageSize: 20 });
    expect(total).toBe(1);
    expect(items[0]?.documentName).toBe('AWS January');
  });

  it('list paginates', () => {
    for (let i = 0; i < 25; i++) {
      repo.insert({ ...sample, id: i.toString().padStart(8, '0') + '-1111-4111-8111-111111111111' });
    }
    const { items, total } = repo.list({ page: 2, pageSize: 10 });
    expect(total).toBe(25);
    expect(items).toHaveLength(10);
  });

  it('delete removes row and FTS entry', () => {
    repo.insert(sample);
    expect(repo.delete(sample.id)).toBe(true);
    expect(repo.getById(sample.id)).toBeNull();
    const { total } = repo.list({ q: 'AWS', page: 1, pageSize: 20 });
    expect(total).toBe(0);
  });

  it('delete returns false for unknown id', () => {
    expect(repo.delete('99999999-9999-4999-8999-999999999999')).toBe(false);
  });
});
