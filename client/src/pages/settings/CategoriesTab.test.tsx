import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CategoryDTO } from '../../types.js';
import { CategoriesTab } from './CategoriesTab.js';
import { categoriesApi } from '../../api.js';

vi.mock('../../api.js', () => ({
  categoriesApi: {
    list: vi.fn(),
    create: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
  },
}));

const mockApi = vi.mocked(categoriesApi);

const FINANCE: CategoryDTO = {
  id: 'c1',
  name: 'Finance',
  sortOrder: 0,
  disabledAt: null,
  createdAt: '2026-01-01',
};

describe('CategoriesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.list.mockResolvedValue({ items: [FINANCE] });
  });

  it('renders categories from list including disabled', async () => {
    render(<CategoriesTab />);
    expect(await screen.findByText('Finance')).toBeTruthy();
    expect(mockApi.list).toHaveBeenCalledWith(true);
  });

  it('+ New creates a category', async () => {
    mockApi.list.mockResolvedValue({ items: [] });
    mockApi.create.mockResolvedValue(FINANCE);
    render(<CategoriesTab />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New' }));
    fireEvent.change(screen.getByLabelText('new name'), { target: { value: 'Finance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(mockApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Finance' })),
    );
  });

  it('rename calls patch with the new name', async () => {
    mockApi.patch.mockResolvedValue({ ...FINANCE, name: 'Ops' });
    render(<CategoriesTab />);
    await screen.findByText('Finance');
    fireEvent.click(screen.getByRole('button', { name: 'edit c1' }));
    fireEvent.change(screen.getByLabelText('name for c1'), { target: { value: 'Ops' } });
    fireEvent.click(screen.getByRole('button', { name: 'save c1' }));
    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'Ops' })),
    );
  });

  it('disable toggle calls patch with a non-null disabledAt for an active row', async () => {
    mockApi.patch.mockResolvedValue({ ...FINANCE, disabledAt: '2026-05-26T00:00:00.000Z' });
    render(<CategoriesTab />);
    await screen.findByText('Finance');
    fireEvent.click(screen.getByRole('button', { name: 'disable c1' }));
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalled());
    const [id, patch] = mockApi.patch.mock.calls[0]!;
    expect(id).toBe('c1');
    expect(patch.disabledAt).toEqual(expect.any(String));
  });

  it('delete calls remove after confirmation', async () => {
    mockApi.remove.mockResolvedValue(undefined);
    render(<CategoriesTab />);
    await screen.findByText('Finance');
    fireEvent.click(screen.getByRole('button', { name: 'delete c1' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm delete c1' }));
    await waitFor(() => expect(mockApi.remove).toHaveBeenCalledWith('c1'));
  });

  it('surfaces NAME_TAKEN when creating a duplicate name', async () => {
    mockApi.list.mockResolvedValue({ items: [] });
    mockApi.create.mockRejectedValue({ code: 'NAME_TAKEN', message: 'category already exists' });
    render(<CategoriesTab />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New' }));
    fireEvent.change(screen.getByLabelText('new name'), { target: { value: 'Finance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect((await screen.findByRole('alert')).textContent).toContain('NAME_TAKEN');
  });
});
