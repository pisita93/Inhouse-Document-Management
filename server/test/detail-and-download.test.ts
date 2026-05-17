import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('GET /api/documents/:id and :id/file', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  async function uploadAndGetId(): Promise<string> {
    const res = await request(env.app)
      .post('/api/documents')
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

  it('returns metadata for an existing document', async () => {
    const id = await uploadAndGetId();
    const res = await request(env.app).get(`/api/documents/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('404 for unknown id', async () => {
    const res = await request(env.app).get('/api/documents/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('streams file with Content-Disposition', async () => {
    const id = await uploadAndGetId();
    const res = await request(env.app).get(`/api/documents/${id}/file`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/orig\.pdf/);
    expect(res.body.length).toBe(env.fixtures.PDF_MIN.length);
  });

  it('returns 410 FILE_GONE if DB row exists but file is missing', async () => {
    const id = await uploadAndGetId();
    const dto = env.repo.getById(id)!;
    const yyyy = dto.createdAt.slice(0, 4);
    const mm = dto.createdAt.slice(5, 7);
    fs.unlinkSync(path.join(env.tmp, 'file', yyyy, mm, dto.filename));
    const res = await request(env.app).get(`/api/documents/${id}/file`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('FILE_GONE');
  });
});
