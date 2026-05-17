import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('DELETE /api/documents/:id', () => {
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
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    return res.body.id;
  }

  it('removes row and file', async () => {
    const id = await uploadAndGetId();
    const dto = env.repo.getById(id)!;
    const yyyy = dto.createdAt.slice(0, 4);
    const mm = dto.createdAt.slice(5, 7);
    const res = await request(env.app).delete(`/api/documents/${id}`);
    expect(res.status).toBe(204);
    expect(env.repo.getById(id)).toBeNull();
    expect(fs.existsSync(path.join(env.tmp, 'file', yyyy, mm, dto.filename))).toBe(false);
  });

  it('returns 204 even if the file is already gone (orphan tolerance)', async () => {
    const id = await uploadAndGetId();
    const dto = env.repo.getById(id)!;
    const yyyy = dto.createdAt.slice(0, 4);
    const mm = dto.createdAt.slice(5, 7);
    fs.unlinkSync(path.join(env.tmp, 'file', yyyy, mm, dto.filename));
    const res = await request(env.app).delete(`/api/documents/${id}`);
    expect(res.status).toBe(204);
    expect(env.repo.getById(id)).toBeNull();
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(env.app).delete(
      '/api/documents/00000000-0000-4000-8000-000000000000',
    );
    expect(res.status).toBe(404);
  });

  it('also drops the FTS index entry', async () => {
    const id = await uploadAndGetId();
    await request(env.app).delete(`/api/documents/${id}`);
    const search = await request(env.app).get('/api/documents?q=D');
    expect(search.body.total).toBe(0);
  });
});
