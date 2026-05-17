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
  });

  it('rejects invoice missing amount with VALIDATION + fields.amount', async () => {
    const bad = { ...validInvoice } as Record<string, unknown>;
    delete bad.amount;
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(bad))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.fields.amount).toBeTruthy();
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

  it('rejects unknown type', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify({ ...validInvoice, type: 'bogus' }))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.fields.type).toBeTruthy();
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
