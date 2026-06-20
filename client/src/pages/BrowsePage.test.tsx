import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CategoryDTO, DocumentDTO, TagDTO } from '../types.js';
import { BrowsePage } from './BrowsePage.js';
import { api, categoriesApi, tagsApi } from '../api.js';

vi.mock('../api.js', () => ({
  api: { list: vi.fn() },
  categoriesApi: { list: vi.fn() },
  tagsApi: { list: vi.fn() },
}));

const mockApi = vi.mocked(api);
const mockCategories = vi.mocked(categoriesApi);
const mockTags = vi.mocked(tagsApi);

const CAT_ID = '11111111-1111-4111-8111-111111111111';
const TAG_ID = '22222222-2222-4222-8222-222222222222';

const FINANCE_CATEGORY: CategoryDTO = {
  id: CAT_ID,
  name: 'Finance',
  sortOrder: 0,
  disabledAt: null,
  createdAt: '2026-01-01',
};

const Q2_TAG: TagDTO = { id: TAG_ID, name: 'q2-2026', createdAt: '2026-01-01' };

function doc(overrides: Partial<DocumentDTO> = {}): DocumentDTO {
  return {
    id: 'd1',
    documentName: 'Doc One',
    type: 'invoice',
    category: null,
    tags: [],
    documentDate: '2026-05-01',
    invoiceDate: null,
    amount: null,
    currency: null,
    filename: 'f.pdf',
    originalName: 'f.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BrowsePage />
    </MemoryRouter>,
  );
}

const emptyList = { items: [] as DocumentDTO[], total: 0, page: 1, pageSize: 20 };

describe('BrowsePage filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.list.mockResolvedValue(emptyList);
    mockCategories.list.mockResolvedValue({ items: [FINANCE_CATEGORY] });
    mockTags.list.mockResolvedValue({ items: [Q2_TAG] });
  });

  it('populates the category and tag filter dropdowns', async () => {
    renderPage();
    await waitFor(() => expect(mockCategories.list).toHaveBeenCalled());
    expect(mockTags.list).toHaveBeenCalled();
    expect(screen.getAllByRole('option', { name: 'Finance' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('option', { name: 'q2-2026' }).length).toBeGreaterThan(0);
  });

  it('applies the category and tag filters to the list query', async () => {
    renderPage();
    await screen.findAllByRole('option', { name: 'Finance' });
    fireEvent.change(screen.getAllByLabelText('Category')[0]!, { target: { value: CAT_ID } });
    const tagSelect = screen.getAllByLabelText('Tags')[0] as HTMLSelectElement;
    Array.from(tagSelect.options).find((o) => o.value === TAG_ID)!.selected = true;
    fireEvent.change(tagSelect);
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' })[0]!);
    await waitFor(() => {
      const calls = mockApi.list.mock.calls;
      const last = calls[calls.length - 1]![0];
      expect(last).toEqual(
        expect.objectContaining({ categoryId: CAT_ID, tagIds: [TAG_ID], tagMatch: 'all' }),
      );
    });
  });

  it('resets the category and tag filters', async () => {
    renderPage();
    await screen.findAllByRole('option', { name: 'Finance' });
    fireEvent.change(screen.getAllByLabelText('Category')[0]!, { target: { value: CAT_ID } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset' })[0]!);
    await waitFor(() => {
      const calls = mockApi.list.mock.calls;
      const last = calls[calls.length - 1]![0];
      expect(last.categoryId).toBeUndefined();
      expect(last.tagIds).toBeUndefined();
    });
  });
});

describe('BrowsePage row badges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCategories.list.mockResolvedValue({ items: [] });
    mockTags.list.mockResolvedValue({ items: [] });
  });

  it('renders a category badge when the document has a category', async () => {
    mockApi.list.mockResolvedValue({
      ...emptyList,
      items: [doc({ category: { id: CAT_ID, name: 'Finance' } })],
      total: 1,
    });
    renderPage();
    expect(await screen.findByText('Finance')).toBeTruthy();
  });

  it('renders up to 3 tag chips with a +N more overflow', async () => {
    mockApi.list.mockResolvedValue({
      ...emptyList,
      items: [
        doc({
          tags: [
            { id: 't1', name: 'alpha' },
            { id: 't2', name: 'beta' },
            { id: 't3', name: 'gamma' },
            { id: 't4', name: 'delta' },
            { id: 't5', name: 'epsilon' },
          ],
        }),
      ],
      total: 1,
    });
    renderPage();
    expect(await screen.findByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.getByText('gamma')).toBeTruthy();
    expect(screen.queryByText('delta')).toBeNull();
    expect(screen.getByText('+2 more')).toBeTruthy();
  });
});
