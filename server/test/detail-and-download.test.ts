import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('GET /api/receipts/:id and :id/file', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  async function uploadAndGetId(): Promise<string> {
    const res = await request(env.app)
      .post('/api/receipts')
      .field(
        'metadata',
        JSON.stringify({
          documentName: 'D',
          type: 'invoice',
          invoiceDate: '2026-01-15',
          amount: 1,
          currency: 'THB',
        }),
      )
      .attach('file', env.fixtures.PDF_MIN, 'orig.pdf');
    return res.body.id;
  }

  it('returns metadata for an existing receipt', async () => {
    const id = await uploadAndGetId();
    const res = await request(env.app).get(`/api/receipts/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('404 for unknown id', async () => {
    const res = await request(env.app).get('/api/receipts/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('streams file with Content-Disposition', async () => {
    const id = await uploadAndGetId();
    const res = await request(env.app).get(`/api/receipts/${id}/file`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/orig\.pdf/);
    expect(res.body.length).toBe(env.fixtures.PDF_MIN.length);
  });

  it('returns 410 FILE_GONE if DB row exists but file is missing', async () => {
    const id = await uploadAndGetId();
    const dto = env.repo.getById(id)!;
    fs.unlinkSync(path.join(env.tmp, 'file', '2026', '01', dto.filename));
    const res = await request(env.app).get(`/api/receipts/${id}/file`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('FILE_GONE');
  });
});
