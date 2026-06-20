import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { makeTestEnv } from './helpers.js';

function backdate(file: string): void {
  const old = new Date(Date.now() - 5 * 60_000);
  fs.utimesSync(file, old, old);
}

describe('POST /api/maintenance/orphans/sweep', () => {
  it('removes orphan files and keeps files with a matching document row', async () => {
    const env = makeTestEnv();
    try {
      const dir = path.join(env.tmp, 'file', '2026', '01');
      fs.mkdirSync(dir, { recursive: true });
      const orphan = path.join(dir, 'orphan-id.pdf');
      fs.writeFileSync(orphan, 'orphaned');
      backdate(orphan);

      env.repo.insertWithRelations({
        dto: {
          id: 'known-id',
          documentName: 'Keep',
          type: 'other',
          documentDate: '2026-01-01',
          invoiceDate: null,
          amount: null,
          currency: null,
          shortNote: null,
          note: null,
          filename: 'known-id.pdf',
          originalName: 'k.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 5,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        categoryId: null,
        tagNames: [],
      });
      const known = path.join(dir, 'known-id.pdf');
      fs.writeFileSync(known, 'keep');
      backdate(known);

      const res = await request(env.app).post('/api/maintenance/orphans/sweep');
      expect(res.status).toBe(200);
      expect(res.body.removed).toBe(1);
      expect(fs.existsSync(orphan)).toBe(false);
      expect(fs.existsSync(known)).toBe(true);
    } finally {
      env.cleanup();
    }
  });

  it('dryRun=true reports without deleting', async () => {
    const env = makeTestEnv();
    try {
      const dir = path.join(env.tmp, 'file', '2026', '01');
      fs.mkdirSync(dir, { recursive: true });
      const orphan = path.join(dir, 'orphan-id.pdf');
      fs.writeFileSync(orphan, 'orphaned');
      backdate(orphan);

      const res = await request(env.app).post('/api/maintenance/orphans/sweep?dryRun=true');
      expect(res.status).toBe(200);
      expect(res.body.removed).toBe(1);
      expect(fs.existsSync(orphan)).toBe(true);
    } finally {
      env.cleanup();
    }
  });
});
