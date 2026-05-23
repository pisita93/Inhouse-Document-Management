import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createDocumentsRepo, type DocumentRowInput } from '../src/db/documentsRepo.js';

const baseInvoice: DocumentRowInput = {
  id: '11111111-1111-4111-8111-111111111111',
  documentName: 'AWS January',
  type: 'invoice',
  documentDate: '2026-01-20',
  invoiceDate: '2026-01-15',
  amount: 12500,
  currency: 'THB',
  shortNote: null,
  note: 'monthly',
  filename: '11111111-1111-4111-8111-111111111111.pdf',
  originalName: 'aws-jan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: '2026-01-20T10:00:00.000Z',
};

const baseContract: DocumentRowInput = {
  ...baseInvoice,
  id: '22222222-2222-4222-8222-222222222222',
  documentName: 'NDA 2026',
  type: 'contract',
  documentDate: '2026-02-10',
  invoiceDate: null,
  amount: null,
  currency: null,
  note: null,
  createdAt: '2026-02-10T08:00:00.000Z',
};

describe('documentsRepo', () => {
  let tmp: string;
  let db: DB;
  let repo: ReturnType<typeof createDocumentsRepo>;

  function insert(
    row: DocumentRowInput,
    opts: { categoryId?: string | null; tagNames?: string[] } = {},
  ) {
    return repo.insertWithRelations({
      dto: row,
      categoryId: opts.categoryId ?? null,
      tagNames: opts.tagNames ?? [],
    });
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
    db = openDatabase(path.join(tmp, 'test.db'));
    runMigrations(db);
    repo = createDocumentsRepo(db);
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('insertWithRelations + getById roundtrip for a financial document', () => {
    insert(baseInvoice);
    expect(repo.getById(baseInvoice.id)).toMatchObject({
      id: baseInvoice.id,
      documentName: baseInvoice.documentName,
      type: 'invoice',
      invoiceDate: '2026-01-15',
      amount: 12500,
      currency: 'THB',
      category: null,
      tags: [],
    });
  });

  it('insertWithRelations + getById roundtrip for a non-financial document (nulls preserved)', () => {
    insert(baseContract);
    const back = repo.getById(baseContract.id);
    expect(back?.invoiceDate).toBeNull();
    expect(back?.amount).toBeNull();
    expect(back?.currency).toBeNull();
    expect(back?.documentDate).toBe('2026-02-10');
    expect(back?.category).toBeNull();
    expect(back?.tags).toEqual([]);
  });

  it('list orders by document_date DESC then created_at DESC', () => {
    insert({
      ...baseInvoice,
      id: 'a'.repeat(8) + '-1111-4111-8111-111111111111',
      documentDate: '2026-01-01',
    });
    insert({
      ...baseInvoice,
      id: 'b'.repeat(8) + '-1111-4111-8111-111111111111',
      documentDate: '2026-03-01',
    });
    const { items } = repo.list({ page: 1, pageSize: 20 });
    expect(items[0]?.documentDate).toBe('2026-03-01');
  });

  it('list filters by type across the new enum', () => {
    insert({
      ...baseInvoice,
      id: 'c'.repeat(8) + '-1111-4111-8111-111111111111',
      type: 'policy',
      invoiceDate: null,
      amount: null,
      currency: null,
    });
    insert({
      ...baseInvoice,
      id: 'd'.repeat(8) + '-1111-4111-8111-111111111111',
      type: 'invoice',
    });
    expect(repo.list({ type: 'policy', page: 1, pageSize: 20 }).total).toBe(1);
    expect(repo.list({ type: 'invoice', page: 1, pageSize: 20 }).total).toBe(1);
  });

  it('invoiceDateFrom/To excludes rows with NULL invoice_date', () => {
    insert(baseInvoice);
    insert(baseContract);
    const r = repo.list({
      invoiceDateFrom: '2026-01-01',
      invoiceDateTo: '2026-12-31',
      page: 1,
      pageSize: 20,
    });
    expect(r.total).toBe(1);
    expect(r.items[0]?.id).toBe(baseInvoice.id);
  });

  it('uploadDateFrom/To filters on document_date and includes non-financial rows', () => {
    insert(baseInvoice);
    insert(baseContract);
    const r = repo.list({
      uploadDateFrom: '2026-02-01',
      uploadDateTo: '2026-02-28',
      page: 1,
      pageSize: 20,
    });
    expect(r.total).toBe(1);
    expect(r.items[0]?.id).toBe(baseContract.id);
  });

  it('combining invoiceDate and uploadDate filters narrows correctly', () => {
    insert(baseInvoice); // invDate 2026-01-15, docDate 2026-01-20
    insert(baseContract); // invDate null, docDate 2026-02-10
    insert({
      ...baseInvoice,
      id: 'e'.repeat(8) + '-1111-4111-8111-111111111111',
      invoiceDate: '2026-02-15',
      documentDate: '2026-02-20',
    });

    const r = repo.list({
      invoiceDateFrom: '2026-02-01',
      uploadDateFrom: '2026-02-01',
      page: 1,
      pageSize: 20,
    });
    expect(r.total).toBe(1);
    expect(r.items[0]?.invoiceDate).toBe('2026-02-15');
  });

  it('list searches FTS by q across new schema', () => {
    insert({ ...baseInvoice, documentName: 'AWS January' });
    insert({
      ...baseInvoice,
      id: 'f'.repeat(8) + '-1111-4111-8111-111111111111',
      documentName: 'GitHub bill',
    });
    const r = repo.list({ q: 'AWS', page: 1, pageSize: 20 });
    expect(r.total).toBe(1);
  });

  it('delete returns true/false; deleted rows leave FTS empty', () => {
    insert(baseInvoice);
    expect(repo.delete(baseInvoice.id)).toBe(true);
    expect(repo.delete(baseInvoice.id)).toBe(false);
    expect(repo.list({ q: 'AWS', page: 1, pageSize: 20 }).total).toBe(0);
  });

  it('reset clears table and FTS', () => {
    insert(baseInvoice);
    insert(baseContract);
    repo.reset();
    expect(repo.list({ page: 1, pageSize: 20 }).total).toBe(0);
    expect(repo.list({ q: 'AWS', page: 1, pageSize: 20 }).total).toBe(0);
  });

  it('insertWithRelations persists tagNames inside the transaction (deduped, lowercased)', () => {
    const result = insert(baseInvoice, { tagNames: ['Finance', 'finance', 'HR-2026'] });
    expect(result.tags.map((t) => t.name).sort()).toEqual(['finance', 'hr-2026']);
    const links = db
      .prepare('SELECT COUNT(*) AS c FROM document_tags WHERE document_id = ?')
      .get(baseInvoice.id) as { c: number };
    expect(links.c).toBe(2);
  });
});
