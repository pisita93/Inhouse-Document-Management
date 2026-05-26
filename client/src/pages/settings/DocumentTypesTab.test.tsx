import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DocumentTypeDTO } from '../../types.js';
import { DocumentTypesTab } from './DocumentTypesTab.js';
import { documentTypesApi } from '../../api.js';

vi.mock('../../api.js', () => ({
  documentTypesApi: {
    list: vi.fn(),
    create: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockApi = vi.mocked(documentTypesApi);

const INVOICE: DocumentTypeDTO = {
  id: 'invoice',
  label: 'Invoice',
  requiresFinancial: true,
  sortOrder: 0,
  disabledAt: null,
  createdAt: '2026-01-01',
};

describe('DocumentTypesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.list.mockResolvedValue({ items: [INVOICE] });
  });

  it('renders rows from documentTypesApi.list including disabled', async () => {
    render(<DocumentTypesTab />);
    expect(await screen.findByText('Invoice')).toBeTruthy();
    expect(mockApi.list).toHaveBeenCalledWith(true);
  });

  it('shows requires_financial as a locked, titled checkbox on existing rows', async () => {
    render(<DocumentTypesTab />);
    const cb = (await screen.findByRole('checkbox', {
      name: 'requires financial for invoice',
    })) as HTMLInputElement;
    expect(cb.checked).toBe(true);
    expect(cb.disabled).toBe(true);
    expect(cb.getAttribute('title')).toBe('Set at creation');
  });

  it('+ New opens a form with an editable requires_financial checkbox', async () => {
    mockApi.list.mockResolvedValue({ items: [] });
    render(<DocumentTypesTab />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New' }));
    const cb = screen.getByRole('checkbox', { name: 'requires financial' }) as HTMLInputElement;
    expect(cb.disabled).toBe(false);
  });

  it('rename calls patch with the new label', async () => {
    mockApi.patch.mockResolvedValue({ ...INVOICE, label: 'Bill' });
    render(<DocumentTypesTab />);
    await screen.findByText('Invoice');
    fireEvent.click(screen.getByRole('button', { name: 'edit invoice' }));
    fireEvent.change(screen.getByLabelText('label for invoice'), { target: { value: 'Bill' } });
    fireEvent.click(screen.getByRole('button', { name: 'save invoice' }));
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('invoice', { label: 'Bill' }));
  });

  it('disable toggle calls patch with a non-null disabledAt for an active row', async () => {
    mockApi.patch.mockResolvedValue({ ...INVOICE, disabledAt: '2026-05-26T00:00:00.000Z' });
    render(<DocumentTypesTab />);
    await screen.findByText('Invoice');
    fireEvent.click(screen.getByRole('button', { name: 'disable invoice' }));
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalled());
    const [id, patch] = mockApi.patch.mock.calls[0]!;
    expect(id).toBe('invoice');
    expect(patch.disabledAt).toEqual(expect.any(String));
  });

  it('surfaces NAME_TAKEN when creating a duplicate id', async () => {
    mockApi.list.mockResolvedValue({ items: [] });
    mockApi.create.mockRejectedValue({ code: 'NAME_TAKEN', message: 'type id already exists' });
    render(<DocumentTypesTab />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New' }));
    fireEvent.change(screen.getByLabelText('new id'), { target: { value: 'invoice' } });
    fireEvent.change(screen.getByLabelText('new label'), { target: { value: 'Invoice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect((await screen.findByRole('alert')).textContent).toContain('NAME_TAKEN');
  });
});
