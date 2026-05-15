import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('DELETE /api/receipts/:id', () => {
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
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    return res.body.id;
  }

  it('removes row and file', async () => {
    const id = await uploadAndGetId();
    const dto = env.repo.getById(id)!;
    const res = await request(env.app).delete(`/api/receipts/${id}`);
    expect(res.status).toBe(204);
    expect(env.repo.getById(id)).toBeNull();
    expect(fs.existsSync(path.join(env.tmp, 'file', '2026', '01', dto.filename))).toBe(false);
  });

  it('returns 204 even if the file is already gone (orphan tolerance)', async () => {
    const id = await uploadAndGetId();
    const dto = env.repo.getById(id)!;
    fs.unlinkSync(path.join(env.tmp, 'file', '2026', '01', dto.filename));
    const res = await request(env.app).delete(`/api/receipts/${id}`);
    expect(res.status).toBe(204);
    expect(env.repo.getById(id)).toBeNull();
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(env.app).delete('/api/receipts/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('also drops the FTS index entry', async () => {
    const id = await uploadAndGetId();
    await request(env.app).delete(`/api/receipts/${id}`);
    const search = await request(env.app).get('/api/receipts?q=D');
    expect(search.body.total).toBe(0);
  });
});
