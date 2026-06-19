import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('POST /api/documents', () => {
  let env: ReturnType<typeof makeTestEnv>;
  beforeEach(() => (env = makeTestEnv()));
  afterEach(() => env.cleanup());

  const validInvoice = {
    documentName: 'Test',
    type: 'invoice' as const,
    invoiceDate: '2026-01-15',
    amount: 100,
    currency: 'THB' as const,
  };
  const validContract = {
    documentName: 'NDA',
    type: 'contract' as const,
  };

  it('uploads invoice PDF → 201, DTO has documentDate set to today, invoice_date preserved', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yyyy = today.slice(0, 4);
    const mm = today.slice(5, 7);

    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(validInvoice))
      .attach('file', env.fixtures.PDF_MIN, 'test.pdf');
    expect(res.status).toBe(201);
    expect(res.body.documentDate).toBe(today);
    expect(res.body.invoiceDate).toBe('2026-01-15');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.category).toBeNull();
    expect(res.body.tags).toEqual([]);

    const onDisk = path.join(env.tmp, 'file', yyyy, mm, `${res.body.id}.pdf`);
    expect(fs.existsSync(onDisk)).toBe(true);
  });

  it('uploads contract → 201, response invoiceDate/amount/currency are null', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(validContract))
      .attach('file', env.fixtures.PDF_MIN, 'nda.pdf');
    expect(res.status).toBe(201);
    expect(res.body.invoiceDate).toBeNull();
    expect(res.body.amount).toBeNull();
    expect(res.body.currency).toBeNull();
    expect(res.body.documentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.category).toBeNull();
    expect(res.body.tags).toEqual([]);
  });

  it('uploads an audio file (WAV) → 201 and stores it', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(validContract))
      .attach('file', env.fixtures.WAV_MIN, 'memo.wav');
    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe('audio/wav');
    expect(res.body.filename).toMatch(/\.wav$/);
  });

  it('uploads a video file (MP4) → 201 and stores it', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(validContract))
      .attach('file', env.fixtures.MP4_MIN, 'clip.mp4');
    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe('video/mp4');
    expect(res.body.filename).toMatch(/\.mp4$/);
  });

  it('rejects invoice without financial trio (FINANCIAL_FIELDS_REQUIRED)', async () => {
    const bad = { ...validInvoice } as Record<string, unknown>;
    delete bad.amount;
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(bad))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FINANCIAL_FIELDS_REQUIRED');
  });

  it('client-supplied documentDate is ignored (server overrides)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify({ ...validInvoice, documentDate: '2099-12-31' }))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(201);
    expect(res.body.documentDate).toBe(today);
  });

  it('rejects missing metadata', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
  });

  it('rejects bad metadata JSON', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', '{not json')
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
  });

  it('rejects unknown type (UNKNOWN_OR_DISABLED_TYPE)', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify({ ...validInvoice, type: 'bogus' }))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_OR_DISABLED_TYPE');
  });

  it('rejects disabled type (UNKNOWN_OR_DISABLED_TYPE)', async () => {
    env.documentTypesRepo.patch('other', { disabledAt: new Date().toISOString() });
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify({ documentName: 'X', type: 'other' }))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_OR_DISABLED_TYPE');
  });

  it('rejects unknown categoryId (UNKNOWN_OR_DISABLED_CATEGORY)', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field(
        'metadata',
        JSON.stringify({
          ...validContract,
          categoryId: '00000000-0000-4000-8000-000000000000',
        }),
      )
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_OR_DISABLED_CATEGORY');
  });

  it('rejects disabled categoryId (UNKNOWN_OR_DISABLED_CATEGORY)', async () => {
    const cat = env.categoriesRepo.create({ name: 'Sales', sortOrder: 0 });
    env.categoriesRepo.patch(cat.id, { disabledAt: new Date().toISOString() });
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify({ ...validContract, categoryId: cat.id }))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_OR_DISABLED_CATEGORY');
  });

  it('accepts active categoryId and reflects it on the DTO', async () => {
    const cat = env.categoriesRepo.create({ name: 'Finance', sortOrder: 0 });
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify({ ...validContract, categoryId: cat.id }))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(201);
    expect(res.body.category).toEqual({ id: cat.id, name: 'Finance' });
  });

  it('persists tagNames as deduped lowercased tags + document_tags links', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field(
        'metadata',
        JSON.stringify({
          ...validContract,
          tagNames: ['Finance', 'finance', 'HR-2026'],
        }),
      )
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(201);
    const names = (res.body.tags as Array<{ name: string }>).map((t) => t.name).sort();
    expect(names).toEqual(['finance', 'hr-2026']);

    const allTags = env.tagsRepo.list({});
    const tagNames = allTags.map((t) => t.name).sort();
    expect(tagNames).toEqual(['finance', 'hr-2026']);

    const links = env.db
      .prepare('SELECT COUNT(*) AS c FROM document_tags WHERE document_id = ?')
      .get(res.body.id) as { c: number };
    expect(links.c).toBe(2);
  });

  it('reuses existing tag rows when tagNames already exist (case-insensitive)', async () => {
    env.tagsRepo.upsertByName('finance');
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify({ ...validContract, tagNames: ['Finance'] }))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(201);
    expect(env.tagsRepo.list({}).length).toBe(1);
    expect(res.body.tags).toEqual([{ id: expect.any(String), name: 'finance' }]);
  });

  it('rejects file that fails byte-sniff', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(validInvoice))
      .attach('file', Buffer.from('not a real file'), 'fake.pdf');
    expect(res.status).toBe(415);
  });

  it('writes no DB row if upload is rejected (atomicity)', async () => {
    await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(validInvoice))
      .attach('file', Buffer.from('garbage'), 'fake.pdf');
    const { total } = env.repo.list({ page: 1, pageSize: 10 });
    expect(total).toBe(0);
  });
});
