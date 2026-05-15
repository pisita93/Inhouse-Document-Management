import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { makeTestEnv } from './helpers.js';

const meta = (overrides: Record<string, unknown> = {}) => ({
  documentName: 'Doc',
  type: 'invoice',
  invoiceDate: '2026-01-15',
  amount: 100,
  currency: 'THB',
  ...overrides,
});

async function uploadOne(env: ReturnType<typeof makeTestEnv>, overrides: Record<string, unknown> = {}) {
  return request(env.app)
    .post('/api/receipts')
    .field('metadata', JSON.stringify(meta(overrides)))
    .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
}

describe('GET /api/receipts', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  it('returns empty list initially', async () => {
    const res = await request(env.app).get('/api/receipts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('lists most-recent invoiceDate first', async () => {
    await uploadOne(env, { invoiceDate: '2026-01-01', documentName: 'Old' });
    await uploadOne(env, { invoiceDate: '2026-03-01', documentName: 'New' });
    const res = await request(env.app).get('/api/receipts');
    expect(res.body.items[0].documentName).toBe('New');
  });

  it('filters by type', async () => {
    await uploadOne(env, { type: 'invoice' });
    await uploadOne(env, { type: 'receipt' });
    const res = await request(env.app).get('/api/receipts?type=invoice');
    expect(res.body.total).toBe(1);
  });

  it('filters by date range', async () => {
    await uploadOne(env, { invoiceDate: '2026-01-01' });
    await uploadOne(env, { invoiceDate: '2026-06-01' });
    const res = await request(env.app).get('/api/receipts?dateFrom=2026-03-01&dateTo=2026-12-31');
    expect(res.body.total).toBe(1);
  });

  it('full-text search via q', async () => {
    await uploadOne(env, { documentName: 'AWS January' });
    await uploadOne(env, { documentName: 'GitHub bill' });
    const res = await request(env.app).get('/api/receipts?q=AWS');
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].documentName).toBe('AWS January');
  });

  it('paginates', async () => {
    for (let i = 0; i < 25; i++) await uploadOne(env, { documentName: `Doc ${i}` });
    const res = await request(env.app).get('/api/receipts?page=2&pageSize=10');
    expect(res.body.total).toBe(25);
    expect(res.body.items).toHaveLength(10);
  });

  it('400s on invalid pageSize', async () => {
    const res = await request(env.app).get('/api/receipts?pageSize=500');
    expect(res.status).toBe(400);
  });
});
