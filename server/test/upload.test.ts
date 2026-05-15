import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('POST /api/receipts', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  const validMeta = {
    documentName: 'Test',
    type: 'invoice' as const,
    invoiceDate: '2026-01-15',
    amount: 100,
    currency: 'THB' as const,
  };

  it('uploads PDF, returns 201 with DTO, writes file at YYYY/MM/uuid.pdf', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify(validMeta))
      .attach('file', env.fixtures.PDF_MIN, 'test.pdf');
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.mimeType).toBe('application/pdf');
    expect(res.body.originalName).toBe('test.pdf');

    const onDisk = path.join(env.tmp, 'file', '2026', '01', `${res.body.id}.pdf`);
    expect(fs.existsSync(onDisk)).toBe(true);
  });

  it('uploads PNG with image/png mime', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify(validMeta))
      .attach('file', env.fixtures.PNG_1x1, 'small.png');
    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe('image/png');
  });

  it('rejects missing metadata', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .attach('file', env.fixtures.PDF_MIN, 'test.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('rejects bad metadata JSON', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', '{not json')
      .attach('file', env.fixtures.PDF_MIN, 'test.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('rejects metadata that fails schema', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify({ ...validMeta, type: 'bogus' }))
      .attach('file', env.fixtures.PDF_MIN, 'test.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.fields.type).toBeTruthy();
  });

  it('rejects missing file', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify(validMeta));
    expect(res.status).toBe(400);
  });

  it('rejects file that fails byte-sniff', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify(validMeta))
      .attach('file', Buffer.from('not a real file'), 'fake.pdf');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('writes no DB row if the upload is rejected (atomicity)', async () => {
    await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify(validMeta))
      .attach('file', Buffer.from('garbage'), 'fake.pdf');
    const { total } = env.repo.list({ page: 1, pageSize: 10 });
    expect(total).toBe(0);
  });
});
