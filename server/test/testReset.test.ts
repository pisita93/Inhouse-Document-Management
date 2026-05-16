import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('POST /api/test/reset', () => {
  let env: ReturnType<typeof makeTestEnv>;

  afterEach(() => env.cleanup());

  describe('when testResetEnabled is true', () => {
    beforeEach(() => {
      env = makeTestEnv({ testResetEnabled: true });
    });

    it('returns 200 and wipes receipts + files', async () => {
      const upload = await request(env.app)
        .post('/api/receipts')
        .field(
          'metadata',
          JSON.stringify({
            documentName: 'To wipe',
            type: 'invoice',
            invoiceDate: '2026-05-01',
            amount: 100,
            currency: 'THB',
          }),
        )
        .attach('file', env.fixtures.PDF_MIN, 'wipe.pdf');
      expect(upload.status).toBe(201);
      const onDisk = path.join(env.tmp, 'file', '2026', '05', `${upload.body.id}.pdf`);
      expect(fs.existsSync(onDisk)).toBe(true);

      const res = await request(env.app).post('/api/test/reset');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      expect(env.repo.list({ page: 1, pageSize: 20 }).total).toBe(0);
      expect(fs.existsSync(onDisk)).toBe(false);
    });
  });

  describe('when testResetEnabled is false (default)', () => {
    beforeEach(() => {
      env = makeTestEnv();
    });

    it('does not register the route', async () => {
      const res = await request(env.app).post('/api/test/reset');
      expect(res.status).toBe(404);
    });
  });
});
