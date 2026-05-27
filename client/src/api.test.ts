import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, tagsApi, categoriesApi, documentTypesApi } from './api.js';

function mockResponses(...responses: Array<Partial<Response> & { jsonBody?: unknown }>) {
  let i = 0;
  global.fetch = vi.fn(async (input?: unknown) => {
    const r = responses[i++] ?? responses[responses.length - 1]!;
    const make = () =>
      ({
        ok: (r.status ?? 200) < 400,
        status: r.status ?? 200,
        url: typeof input === 'string' ? input : '',
        json: async () => r.jsonBody,
        blob: async () => new Blob(['x']),
        clone() {
          return make();
        },
      }) as unknown as Response;
    return make();
  });
}

function lastFetchCall(): [string, RequestInit] {
  const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const last = calls[calls.length - 1]!;
  return [String(last[0]), (last[1] ?? {}) as RequestInit];
}

describe('api', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('list calls /api/documents and resolves with body', async () => {
    mockResponses({ status: 200, jsonBody: { items: [], total: 0, page: 1, pageSize: 20 } });
    const res = await api.list({});
    expect(res.total).toBe(0);
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(String(calls[0]?.[0])).toMatch(/^\/api\/documents/);
  });

  it('list serializes invoiceDateFrom/To and uploadDateFrom/To independently', async () => {
    mockResponses({ status: 200, jsonBody: { items: [], total: 0, page: 1, pageSize: 20 } });
    await api.list({
      invoiceDateFrom: '2026-01-01',
      uploadDateTo: '2026-12-31',
    });
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const url = String(calls[0]?.[0]);
    expect(url).toContain('invoiceDateFrom=2026-01-01');
    expect(url).toContain('uploadDateTo=2026-12-31');
  });

  it('list serializes categoryId and tagId', async () => {
    mockResponses({ status: 200, jsonBody: { items: [], total: 0, page: 1, pageSize: 20 } });
    await api.list({
      categoryId: '11111111-1111-4111-8111-111111111111',
      tagId: '22222222-2222-4222-8222-222222222222',
    });
    const url = String(
      (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0],
    );
    expect(url).toContain('categoryId=11111111-1111-4111-8111-111111111111');
    expect(url).toContain('tagId=22222222-2222-4222-8222-222222222222');
  });

  it('retries once on DB_BUSY then resolves', async () => {
    mockResponses(
      { status: 503, jsonBody: { error: { code: 'DB_BUSY', message: 'busy' } } },
      { status: 200, jsonBody: { items: [], total: 0, page: 1, pageSize: 20 } },
    );
    const res = await api.list({});
    expect(res.total).toBe(0);
    expect((global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
  });

  it('does not retry on non-busy errors', async () => {
    mockResponses({ status: 404, jsonBody: { error: { code: 'NOT_FOUND', message: 'no' } } });
    await expect(api.getById('x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });
});

describe('tagsApi', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('list GETs /api/tags and returns items', async () => {
    mockResponses({
      status: 200,
      jsonBody: { items: [{ id: 't1', name: 'finance', createdAt: '2026-01-01' }] },
    });
    const res = await tagsApi.list();
    expect(res.items).toHaveLength(1);
    expect(lastFetchCall()[0]).toBe('/api/tags');
  });

  it('list URL-encodes the query', async () => {
    mockResponses({ status: 200, jsonBody: { items: [] } });
    await tagsApi.list('a b');
    expect(lastFetchCall()[0]).toBe('/api/tags?q=a%20b');
  });

  it('create POSTs the name', async () => {
    mockResponses({
      status: 201,
      jsonBody: { id: 't1', name: 'finance', createdAt: '2026-01-01' },
    });
    const dto = await tagsApi.create('finance');
    expect(dto.name).toBe('finance');
    const [url, init] = lastFetchCall();
    expect(url).toBe('/api/tags');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'finance' });
  });

  it('rename PATCHes the new name', async () => {
    mockResponses({ status: 200, jsonBody: { id: 't1', name: 'fin', createdAt: '2026-01-01' } });
    await tagsApi.rename('t1', 'fin');
    const [url, init] = lastFetchCall();
    expect(url).toBe('/api/tags/t1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'fin' });
  });

  it('remove DELETEs and resolves on 204', async () => {
    mockResponses({ status: 204 });
    await expect(tagsApi.remove('t1')).resolves.toBeUndefined();
    const [url, init] = lastFetchCall();
    expect(url).toBe('/api/tags/t1');
    expect(init.method).toBe('DELETE');
  });
});

describe('categoriesApi', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('list GETs /api/categories and returns items', async () => {
    mockResponses({
      status: 200,
      jsonBody: {
        items: [
          { id: 'c1', name: 'Finance', sortOrder: 0, disabledAt: null, createdAt: '2026-01-01' },
        ],
      },
    });
    const res = await categoriesApi.list();
    expect(res.items[0]?.name).toBe('Finance');
    expect(lastFetchCall()[0]).toBe('/api/categories');
  });

  it('create POSTs name and sortOrder', async () => {
    mockResponses({
      status: 201,
      jsonBody: {
        id: 'c1',
        name: 'Finance',
        sortOrder: 2,
        disabledAt: null,
        createdAt: '2026-01-01',
      },
    });
    await categoriesApi.create({ name: 'Finance', sortOrder: 2 });
    const [url, init] = lastFetchCall();
    expect(url).toBe('/api/categories');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Finance', sortOrder: 2 });
  });

  it('patch PATCHes the given fields', async () => {
    mockResponses({
      status: 200,
      jsonBody: { id: 'c1', name: 'Ops', sortOrder: 0, disabledAt: null, createdAt: '2026-01-01' },
    });
    await categoriesApi.patch('c1', { name: 'Ops' });
    const [url, init] = lastFetchCall();
    expect(url).toBe('/api/categories/c1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Ops' });
  });

  it('remove DELETEs and resolves on 204', async () => {
    mockResponses({ status: 204 });
    await expect(categoriesApi.remove('c1')).resolves.toBeUndefined();
    const [url, init] = lastFetchCall();
    expect(url).toBe('/api/categories/c1');
    expect(init.method).toBe('DELETE');
  });
});

describe('documentTypesApi', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('list GETs /api/document-types and returns items', async () => {
    mockResponses({
      status: 200,
      jsonBody: {
        items: [
          {
            id: 'invoice',
            label: 'Invoice',
            requiresFinancial: true,
            sortOrder: 0,
            disabledAt: null,
            createdAt: '2026-01-01',
          },
        ],
      },
    });
    const res = await documentTypesApi.list();
    expect(res.items[0]?.id).toBe('invoice');
    expect(lastFetchCall()[0]).toBe('/api/document-types');
  });

  it('create POSTs the new type', async () => {
    mockResponses({
      status: 201,
      jsonBody: {
        id: 'memo',
        label: 'Memo',
        requiresFinancial: false,
        sortOrder: 1,
        disabledAt: null,
        createdAt: '2026-01-01',
      },
    });
    await documentTypesApi.create({
      id: 'memo',
      label: 'Memo',
      requiresFinancial: false,
      sortOrder: 1,
    });
    const [url, init] = lastFetchCall();
    expect(url).toBe('/api/document-types');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      id: 'memo',
      label: 'Memo',
      requiresFinancial: false,
      sortOrder: 1,
    });
  });

  it('patch PATCHes the label', async () => {
    mockResponses({
      status: 200,
      jsonBody: {
        id: 'memo',
        label: 'Internal Memo',
        requiresFinancial: false,
        sortOrder: 1,
        disabledAt: null,
        createdAt: '2026-01-01',
      },
    });
    await documentTypesApi.patch('memo', { label: 'Internal Memo' });
    const [url, init] = lastFetchCall();
    expect(url).toBe('/api/document-types/memo');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ label: 'Internal Memo' });
  });
});
