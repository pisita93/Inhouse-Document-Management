import type {
  CategoryDTO,
  DocumentCreate,
  DocumentDTO,
  DocumentTypeDTO,
  ListQuery,
  TagDTO,
} from './types.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

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

async function requestVoid(input: RequestInfo, init?: RequestInit): Promise<void> {
  const res = await fetch(input, init);
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
}

function buildQuery(q: Partial<ListQuery>): string {
  const sp = new URLSearchParams();
  if (q.type) sp.set('type', q.type);
  if (q.categoryId) sp.set('categoryId', q.categoryId);
  if (q.tagId) sp.set('tagId', q.tagId);
  if (q.invoiceDateFrom) sp.set('invoiceDateFrom', q.invoiceDateFrom);
  if (q.invoiceDateTo) sp.set('invoiceDateTo', q.invoiceDateTo);
  if (q.uploadDateFrom) sp.set('uploadDateFrom', q.uploadDateFrom);
  if (q.uploadDateTo) sp.set('uploadDateTo', q.uploadDateTo);
  if (q.q) sp.set('q', q.q);
  if (q.shortNote) sp.set('shortNote', q.shortNote);
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

  fileUrl(id: string, opts: { inline?: boolean } = {}): string {
    return `/api/documents/${id}/file${opts.inline ? '?inline=1' : ''}`;
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({ error: { code: 'INTERNAL', message: '' } }));
      throw new ApiClientError(body.error.code, body.error.message);
    }
  },
};

export const tagsApi = {
  list(q?: string): Promise<{ items: TagDTO[] }> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return request(`/api/tags${qs}`);
  },
  create(name: string): Promise<TagDTO> {
    return request('/api/tags', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    });
  },
  rename(id: string, name: string): Promise<TagDTO> {
    return request(`/api/tags/${id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    });
  },
  remove(id: string): Promise<void> {
    return requestVoid(`/api/tags/${id}`, { method: 'DELETE' });
  },
};

interface CategoryCreateInput {
  name: string;
  sortOrder?: number;
}

interface CategoryPatchInput {
  name?: string;
  sortOrder?: number;
  disabledAt?: string | null;
}

export const categoriesApi = {
  list(includeDisabled = false): Promise<{ items: CategoryDTO[] }> {
    const qs = includeDisabled ? '?includeDisabled=true' : '';
    return request(`/api/categories${qs}`);
  },
  create(input: CategoryCreateInput): Promise<CategoryDTO> {
    return request('/api/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  },
  patch(id: string, patch: CategoryPatchInput): Promise<CategoryDTO> {
    return request(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
  },
  remove(id: string): Promise<void> {
    return requestVoid(`/api/categories/${id}`, { method: 'DELETE' });
  },
};

interface DocumentTypeCreateInput {
  id: string;
  label: string;
  requiresFinancial?: boolean;
  sortOrder?: number;
}

interface DocumentTypePatchInput {
  label?: string;
  sortOrder?: number;
  disabledAt?: string | null;
}

export const documentTypesApi = {
  list(includeDisabled = false): Promise<{ items: DocumentTypeDTO[] }> {
    const qs = includeDisabled ? '?includeDisabled=true' : '';
    return request(`/api/document-types${qs}`);
  },
  create(input: DocumentTypeCreateInput): Promise<DocumentTypeDTO> {
    return request('/api/document-types', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  },
  patch(id: string, patch: DocumentTypePatchInput): Promise<DocumentTypeDTO> {
    return request(`/api/document-types/${id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
  },
};
