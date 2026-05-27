import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CategoryDTO, DocumentTypeDTO } from '../types.js';
import { UploadPage } from './UploadPage.js';
import { api, documentTypesApi, categoriesApi, tagsApi } from '../api.js';

vi.mock('../api.js', () => ({
  api: { upload: vi.fn() },
  documentTypesApi: { list: vi.fn() },
  categoriesApi: { list: vi.fn() },
  tagsApi: { list: vi.fn() },
}));

const mockApi = vi.mocked(api);
const mockTypes = vi.mocked(documentTypesApi);
const mockCategories = vi.mocked(categoriesApi);
const mockTags = vi.mocked(tagsApi);

const CATEGORY_ID = '11111111-1111-1111-1111-111111111111';

function typeDTO(id: string, label: string, requiresFinancial: boolean): DocumentTypeDTO {
  return { id, label, requiresFinancial, sortOrder: 0, disabledAt: null, createdAt: '2026-01-01' };
}

const FINANCE_CATEGORY: CategoryDTO = {
  id: CATEGORY_ID,
  name: 'Finance',
  sortOrder: 0,
  disabledAt: null,
  createdAt: '2026-01-01',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <UploadPage />
    </MemoryRouter>,
  );
}

function attachFile(container: HTMLElement, name = 'doc.pdf') {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['data'], name, { type: 'application/pdf' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe('UploadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTypes.list.mockResolvedValue({
      items: [typeDTO('invoice', 'Invoice', true), typeDTO('contract', 'Contract', false)],
    });
    mockCategories.list.mockResolvedValue({ items: [FINANCE_CATEGORY] });
    mockTags.list.mockResolvedValue({ items: [] });
  });

  it('populates the type dropdown from documentTypesApi.list', async () => {
    renderPage();
    expect(await screen.findByRole('option', { name: 'Invoice' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Contract' })).toBeTruthy();
    expect(mockTypes.list).toHaveBeenCalled();
  });

  it('shows the financial trio when the selected type requires it', async () => {
    renderPage();
    await screen.findByRole('option', { name: 'Invoice' });
    // invoice is first and requires financial → trio visible by default
    expect(await screen.findByLabelText('Amount')).toBeTruthy();
  });

  it('hides the financial trio for a non-financial type', async () => {
    renderPage();
    const select = (await screen.findByLabelText('Type')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'contract' } });
    await waitFor(() => expect(screen.queryByLabelText('Amount')).toBeNull());
  });

  it('populates the category dropdown from categoriesApi.list', async () => {
    renderPage();
    expect(await screen.findByRole('option', { name: 'Finance' })).toBeTruthy();
    expect(mockCategories.list).toHaveBeenCalled();
  });

  it('renders the tag chip input', async () => {
    renderPage();
    await screen.findByRole('option', { name: 'Invoice' });
    expect(screen.getByPlaceholderText('Add tag…')).toBeTruthy();
  });

  it('submits metadata with type, categoryId and tagNames', async () => {
    mockApi.upload.mockResolvedValue({ id: 'doc-1' } as never);
    const { container } = renderPage();

    const typeSelect = (await screen.findByLabelText('Type')) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'contract' } });

    fireEvent.change(screen.getByLabelText('Document Name'), { target: { value: 'My Contract' } });

    const categorySelect = screen.getByLabelText('Category') as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: CATEGORY_ID } });

    const tagInput = screen.getByPlaceholderText('Add tag…');
    fireEvent.change(tagInput, { target: { value: 'q2' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    attachFile(container);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(mockApi.upload).toHaveBeenCalled());
    const [, meta] = mockApi.upload.mock.calls[0]!;
    expect(meta).toEqual(
      expect.objectContaining({
        type: 'contract',
        categoryId: CATEGORY_ID,
        tagNames: ['q2'],
      }),
    );
  });
});
