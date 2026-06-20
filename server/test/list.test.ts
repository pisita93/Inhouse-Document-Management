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

async function uploadOne(
  env: ReturnType<typeof makeTestEnv>,
  overrides: Record<string, unknown> = {},
) {
  return request(env.app)
    .post('/api/documents')
    .field('metadata', JSON.stringify(meta(overrides)))
    .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
}

describe('GET /api/documents', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  it('returns empty list initially', async () => {
    const res = await request(env.app).get('/api/documents');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('lists most-recent document_date first', async () => {
    await uploadOne(env, { invoiceDate: '2026-01-01', documentName: 'Old' });
    await uploadOne(env, { invoiceDate: '2026-03-01', documentName: 'New' });
    const res = await request(env.app).get('/api/documents');
    // Both have today's documentDate, so secondary sort is created_at DESC (newest first)
    expect(res.body.items[0].documentName).toBe('New');
  });

  it('filters by type', async () => {
    await uploadOne(env, { type: 'invoice' });
    await uploadOne(env, { type: 'receipt' });
    const res = await request(env.app).get('/api/documents?type=invoice');
    expect(res.body.total).toBe(1);
  });

  it('filters by invoice date range', async () => {
    await uploadOne(env, { invoiceDate: '2026-01-01' });
    await uploadOne(env, { invoiceDate: '2026-06-01' });
    const res = await request(env.app).get(
      '/api/documents?invoiceDateFrom=2026-03-01&invoiceDateTo=2026-12-31',
    );
    expect(res.body.total).toBe(1);
  });

  it('filters by uploadDate independently of invoiceDate', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await uploadOne(env, { invoiceDate: '2026-01-15', type: 'invoice' });
    // Contract — no financial fields
    await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify({ documentName: 'NDA', type: 'contract' }))
      .attach('file', env.fixtures.PDF_MIN, 'nda.pdf');

    const upRes = await request(env.app).get(
      `/api/documents?uploadDateFrom=${today}&uploadDateTo=${today}`,
    );
    expect(upRes.body.total).toBe(2);

    const invRes = await request(env.app).get('/api/documents?invoiceDateFrom=2026-01-01');
    expect(invRes.body.total).toBe(1);
  });

  it('full-text search via q', async () => {
    await uploadOne(env, { documentName: 'AWS January' });
    await uploadOne(env, { documentName: 'GitHub bill' });
    const res = await request(env.app).get('/api/documents?q=AWS');
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].documentName).toBe('AWS January');
  });

  it('paginates', async () => {
    for (let i = 0; i < 25; i++) await uploadOne(env, { documentName: `Doc ${i}` });
    const res = await request(env.app).get('/api/documents?page=2&pageSize=10');
    expect(res.body.total).toBe(25);
    expect(res.body.items).toHaveLength(10);
  });

  it('400s on invalid pageSize', async () => {
    const res = await request(env.app).get('/api/documents?pageSize=500');
    expect(res.status).toBe(400);
  });

  it('filters by categoryId', async () => {
    const catA = env.categoriesRepo.create({ name: 'Alpha', sortOrder: 0 });
    const catB = env.categoriesRepo.create({ name: 'Beta', sortOrder: 0 });
    await uploadOne(env, { documentName: 'A1', categoryId: catA.id });
    await uploadOne(env, { documentName: 'A2', categoryId: catA.id });
    await uploadOne(env, { documentName: 'B1', categoryId: catB.id });
    await uploadOne(env, { documentName: 'NONE' });

    const res = await request(env.app).get(`/api/documents?categoryId=${catA.id}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((d: { documentName: string }) => d.documentName).sort()).toEqual([
      'A1',
      'A2',
    ]);
  });

  it('filters by tagIds', async () => {
    await uploadOne(env, { documentName: 'F1', tagNames: ['finance'] });
    await uploadOne(env, { documentName: 'F2', tagNames: ['finance'] });
    await uploadOne(env, { documentName: 'H1', tagNames: ['hr'] });

    const financeTag = env.tagsRepo.getByName('finance')!;
    const res = await request(env.app).get(`/api/documents?tagIds=${financeTag.id}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((d: { documentName: string }) => d.documentName).sort()).toEqual([
      'F1',
      'F2',
    ]);
  });

  it('list items include category and tags', async () => {
    const cat = env.categoriesRepo.create({ name: 'Finance', sortOrder: 0 });
    await uploadOne(env, {
      documentName: 'Joined',
      categoryId: cat.id,
      tagNames: ['alpha', 'beta'],
    });

    const res = await request(env.app).get('/api/documents');
    expect(res.status).toBe(200);
    expect(res.body.items[0].category).toEqual({ id: cat.id, name: 'Finance' });
    const tagNames = res.body.items[0].tags.map((t: { name: string }) => t.name).sort();
    expect(tagNames).toEqual(['alpha', 'beta']);
  });

  it('detail endpoint includes category and tags', async () => {
    const cat = env.categoriesRepo.create({ name: 'Ops', sortOrder: 0 });
    const create = await uploadOne(env, {
      documentName: 'D',
      categoryId: cat.id,
      tagNames: ['ops-2026'],
    });
    const res = await request(env.app).get(`/api/documents/${create.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.category).toEqual({ id: cat.id, name: 'Ops' });
    expect(res.body.tags.map((t: { name: string }) => t.name)).toEqual(['ops-2026']);
  });
});
