import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TagDTO } from '../../types.js';
import { TagsTab } from './TagsTab.js';
import { tagsApi } from '../../api.js';

vi.mock('../../api.js', () => ({
  tagsApi: {
    list: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
  },
}));

const mockApi = vi.mocked(tagsApi);

const FINANCE: TagDTO = {
  id: 't1',
  name: 'finance',
  createdAt: '2026-01-01',
  usageCount: 3,
};

describe('TagsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.list.mockResolvedValue({ items: [FINANCE] });
  });

  it('renders tags with their usage count', async () => {
    render(<TagsTab />);
    expect(await screen.findByText('finance')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(mockApi.list).toHaveBeenCalled();
  });

  it('rename calls tagsApi.rename with the new name', async () => {
    mockApi.rename.mockResolvedValue({ ...FINANCE, name: 'fin' });
    render(<TagsTab />);
    await screen.findByText('finance');
    fireEvent.click(screen.getByRole('button', { name: 'edit t1' }));
    fireEvent.change(screen.getByLabelText('name for t1'), { target: { value: 'fin' } });
    fireEvent.click(screen.getByRole('button', { name: 'save t1' }));
    await waitFor(() => expect(mockApi.rename).toHaveBeenCalledWith('t1', 'fin'));
  });

  it('delete calls tagsApi.remove after confirmation', async () => {
    mockApi.remove.mockResolvedValue(undefined);
    render(<TagsTab />);
    await screen.findByText('finance');
    fireEvent.click(screen.getByRole('button', { name: 'delete t1' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm delete t1' }));
    await waitFor(() => expect(mockApi.remove).toHaveBeenCalledWith('t1'));
  });
});
