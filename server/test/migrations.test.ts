import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';

describe('migrations', () => {
  let tmp: string;
  let db: DB;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    db = openDatabase(path.join(tmp, 'test.db'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('fresh DB has documents table with FK on type + both date indexes', () => {
    runMigrations(db);

    const cols = db.prepare(`PRAGMA table_info(documents)`).all() as Array<{
      name: string;
      notnull: number;
    }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toEqual(
      expect.arrayContaining([
        'id',
        'document_name',
        'type',
        'document_date',
        'invoice_date',
        'amount',
        'currency',
        'note',
        'filename',
        'original_name',
        'mime_type',
        'size_bytes',
        'created_at',
      ]),
    );

    const docDate = cols.find((c) => c.name === 'document_date');
    const invDate = cols.find((c) => c.name === 'invoice_date');
    expect(docDate?.notnull).toBe(1);
    expect(invDate?.notnull).toBe(0);

    const indexes = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'documents'`)
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        'idx_documents_document_date',
        'idx_documents_invoice_date',
        'idx_documents_type',
        'idx_documents_created_at',
      ]),
    );

    expect(() =>
      db
        .prepare(
          `INSERT INTO documents (
             id, document_name, type, document_date, invoice_date, amount, currency,
             filename, original_name, mime_type, size_bytes, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          '11111111-1111-4111-8111-111111111111',
          'X',
          'bogus_type',
          '2026-01-01',
          null,
          null,
          null,
          'x.pdf',
          'x.pdf',
          'application/pdf',
          1,
          '2026-01-01T00:00:00.000Z',
        ),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('migrating populated receipts → documents backfills document_date from created_at', () => {
    db.exec(`
      CREATE TABLE receipts (
        id TEXT PRIMARY KEY, document_name TEXT, type TEXT, invoice_date TEXT,
        amount INTEGER, currency TEXT, note TEXT, filename TEXT, original_name TEXT,
        mime_type TEXT, size_bytes INTEGER, created_at TEXT);
      INSERT INTO receipts VALUES (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'AWS Jan', 'invoice', '2026-01-15',
        12500, 'THB', null, 'a.pdf', 'aws.pdf', 'application/pdf', 1024,
        '2026-01-20T10:00:00.000Z');
    `);

    runMigrations(db);

    const row = db
      .prepare(`SELECT document_date, invoice_date FROM documents WHERE id = ?`)
      .get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') as {
      document_date: string;
      invoice_date: string;
    };
    expect(row.document_date).toBe('2026-01-20');
    expect(row.invoice_date).toBe('2026-01-15');
  });

  it('reconciles ledger when schema drift leaves a non-idempotent migration unrecorded', () => {
    runMigrations(db);
    db.prepare(`DELETE FROM _migrations WHERE filename = '003_short_note.sql'`).run();

    expect(() => runMigrations(db)).not.toThrow();

    const ledger = db.prepare(`SELECT filename FROM _migrations`).all() as Array<{
      filename: string;
    }>;
    expect(ledger.map((r) => r.filename)).toContain('003_short_note.sql');
  });

  it('is idempotent: running twice produces no duplicate FTS rows', () => {
    runMigrations(db);
    db.prepare(
      `INSERT INTO documents (
         id, document_name, type, document_date, invoice_date, amount, currency, note,
         filename, original_name, mime_type, size_bytes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Doc',
      'contract',
      '2026-02-01',
      null,
      null,
      null,
      null,
      'b.pdf',
      'b.pdf',
      'application/pdf',
      1,
      '2026-02-01T00:00:00.000Z',
    );

    runMigrations(db);

    const docs = (db.prepare(`SELECT COUNT(*) AS c FROM documents`).get() as { c: number }).c;
    const fts = (db.prepare(`SELECT COUNT(*) AS c FROM documents_fts`).get() as { c: number }).c;
    expect(fts).toBe(docs);
  });

  describe('migration 004', () => {
    it('creates document_types, categories, tags, document_tags and rebuilds documents without CHECK', () => {
      runMigrations(db);

      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all()
        .map((r) => (r as { name: string }).name);
      expect(tables).toEqual(
        expect.arrayContaining([
          '_migrations',
          'categories',
          'document_tags',
          'document_types',
          'documents',
          'tags',
        ]),
      );

      const typeCount = (
        db.prepare(`SELECT COUNT(*) AS c FROM document_types`).get() as { c: number }
      ).c;
      expect(typeCount).toBe(10);

      const flags = db
        .prepare(`SELECT id, requires_financial FROM document_types ORDER BY id`)
        .all() as Array<{ id: string; requires_financial: number }>;
      expect(flags.find((r) => r.id === 'invoice')?.requires_financial).toBe(1);
      expect(flags.find((r) => r.id === 'receipt')?.requires_financial).toBe(1);
      expect(flags.find((r) => r.id === 'other')?.requires_financial).toBe(0);

      const cols = db.prepare(`PRAGMA table_info(documents)`).all() as Array<{
        name: string;
        notnull: number;
      }>;
      expect(cols.find((c) => c.name === 'category_id')).toBeTruthy();
      const fks = db.prepare(`PRAGMA foreign_key_list(documents)`).all() as Array<{
        table: string;
        from: string;
        to: string;
      }>;
      expect(fks.some((f) => f.table === 'document_types' && f.from === 'type')).toBe(true);
      expect(fks.some((f) => f.table === 'categories' && f.from === 'category_id')).toBe(true);

      const ftsCols = db
        .prepare(`SELECT name FROM pragma_table_info('documents_fts')`)
        .all() as Array<{ name: string }>;
      expect(ftsCols.map((c) => c.name)).toEqual(
        expect.arrayContaining([
          'document_name',
          'note',
          'short_note',
          'tag_names',
          'category_name',
        ]),
      );
    });

    it('accepts a row of every seeded type under the new schema', () => {
      runMigrations(db);
      const insert = db.prepare(`
        INSERT INTO documents (id, document_name, type, category_id, document_date,
          invoice_date, amount, currency, note, short_note, filename, original_name,
          mime_type, size_bytes, created_at)
        VALUES (?, ?, ?, NULL, '2026-05-21', NULL, NULL, NULL, NULL, NULL,
          'f.pdf', 'f.pdf', 'application/pdf', 1, datetime('now'))
      `);
      const types = [
        'invoice',
        'receipt',
        'quotation',
        'contract',
        'policy',
        'hr_document',
        'meeting_minutes',
        'report',
        'certificate',
        'other',
      ];
      types.forEach((t, i) => {
        insert.run(`doc-${i}`, `name-${t}`, t);
      });

      const count = (db.prepare(`SELECT COUNT(*) AS c FROM documents`).get() as { c: number }).c;
      expect(count).toBe(10);

      const ftsCount = (
        db.prepare(`SELECT COUNT(*) AS c FROM documents_fts`).get() as { c: number }
      ).c;
      expect(ftsCount).toBe(10);
    });

    it('is idempotent — re-running 004 is a no-op for document_types', () => {
      runMigrations(db);
      const before = (db.prepare(`SELECT COUNT(*) AS c FROM document_types`).get() as { c: number })
        .c;
      runMigrations(db);
      const after = (db.prepare(`SELECT COUNT(*) AS c FROM document_types`).get() as { c: number })
        .c;
      expect(after).toBe(before);
    });
  });
});
