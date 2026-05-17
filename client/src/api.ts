import type { DocumentCreate, DocumentDTO, ListQuery } from './types.js';

export interface ApiErrorShape {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiClientError extends Error implements ApiErrorShape {
  constructor(
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public status?: number,
  ) {
    super(message);
  }
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const doFetch = () => fetch(input, init);
  let res = await doFetch();
  if (res.status === 503) {
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    if (body?.error?.code === 'DB_BUSY') {
      await new Promise((r) => setTimeout(r, 250));
      res = await doFetch();
    }
  }
  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ error: { code: 'INTERNAL', message: res.statusText } }));
    throw new ApiClientError(
      body.error?.code ?? 'INTERNAL',
      body.error?.message ?? 'Request failed',
      body.error?.fields,
      res.status,
    );
  }
  return (await res.json()) as T;
}

function buildQuery(q: Partial<ListQuery>): string {
  const sp = new URLSearchParams();
  if (q.type) sp.set('type', q.type);
  if (q.invoiceDateFrom) sp.set('invoiceDateFrom', q.invoiceDateFrom);
  if (q.invoiceDateTo) sp.set('invoiceDateTo', q.invoiceDateTo);
  if (q.uploadDateFrom) sp.set('uploadDateFrom', q.uploadDateFrom);
  if (q.uploadDateTo) sp.set('uploadDateTo', q.uploadDateTo);
  if (q.q) sp.set('q', q.q);
  if (q.page) sp.set('page', String(q.page));
  if (q.pageSize) sp.set('pageSize', String(q.pageSize));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  async upload(file: File, meta: DocumentCreate): Promise<DocumentDTO> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('metadata', JSON.stringify(meta));
    return request<DocumentDTO>('/api/documents', { method: 'POST', body: fd });
  },

  async list(q: Partial<ListQuery>) {
    return request<{ items: DocumentDTO[]; total: number; page: number; pageSize: number }>(
      `/api/documents${buildQuery(q)}`,
    );
  },

  async getById(id: string): Promise<DocumentDTO> {
    return request<DocumentDTO>(`/api/documents/${id}`);
  },

  fileUrl(id: string): string {
    return `/api/documents/${id}/file`;
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({ error: { code: 'INTERNAL', message: '' } }));
      throw new ApiClientError(body.error.code, body.error.message);
    }
  },
};
