import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './api.js';

function mockResponses(...responses: Array<Partial<Response> & { jsonBody?: unknown }>) {
  let i = 0;
  global.fetch = vi.fn(async () => {
    const r = responses[i++] ?? responses[responses.length - 1]!;
    const make = () =>
      ({
        ok: (r.status ?? 200) < 400,
        status: r.status ?? 200,
        json: async () => r.jsonBody,
        blob: async () => new Blob(['x']),
        clone() {
          return make();
        },
      }) as unknown as Response;
    return make();
  });
}

describe('api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('list resolves with body', async () => {
    mockResponses({ status: 200, jsonBody: { items: [], total: 0, page: 1, pageSize: 20 } });
    const res = await api.list({});
    expect(res.total).toBe(0);
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
