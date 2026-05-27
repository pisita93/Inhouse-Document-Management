import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TagDTO } from '../types.js';
import { TagChipInput } from './TagChipInput.js';
import { tagsApi } from '../api.js';

vi.mock('../api.js', () => ({
  tagsApi: {
    list: vi.fn(),
  },
}));

const mockApi = vi.mocked(tagsApi);

function tag(name: string): TagDTO {
  return { id: name, name, createdAt: '2026-01-01' };
}

interface HarnessProps {
  initial?: string[];
  onChangeSpy?: (next: string[]) => void;
}

function Harness({ initial = [], onChangeSpy }: HarnessProps) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <TagChipInput
      value={value}
      onChange={(next) => {
        setValue(next);
        onChangeSpy?.(next);
      }}
    />
  );
}

describe('TagChipInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.list.mockResolvedValue({ items: [] });
  });

  it('renders with empty value and no chips', () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText('Add tag…')).toBeTruthy();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('debounces a fetch to the tags API as the user types', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText('Add tag…'), { target: { value: 'fin' } });
    await waitFor(() => expect(mockApi.list).toHaveBeenCalledWith('fin'));
  });

  it('Enter adds the first suggestion as a chip', async () => {
    mockApi.list.mockResolvedValue({ items: [tag('finance')] });
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    const input = screen.getByPlaceholderText('Add tag…');
    fireEvent.change(input, { target: { value: 'fin' } });
    await screen.findByRole('option');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onChangeSpy).toHaveBeenCalledWith(['finance']));
    expect(screen.getByText('finance')).toBeTruthy();
  });

  it('Enter adds a free-typed value when there is no suggestion', async () => {
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    const input = screen.getByPlaceholderText('Add tag…');
    fireEvent.change(input, { target: { value: 'newtag' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onChangeSpy).toHaveBeenCalledWith(['newtag']));
  });

  it('normalizes a free-typed chip to trimmed lowercase', async () => {
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    const input = screen.getByPlaceholderText('Add tag…');
    fireEvent.change(input, { target: { value: '  Finance  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onChangeSpy).toHaveBeenCalledWith(['finance']));
  });

  it('Backspace on an empty input removes the last chip', async () => {
    const onChangeSpy = vi.fn();
    render(<Harness initial={['finance', 'hr']} onChangeSpy={onChangeSpy} />);
    const input = screen.getByPlaceholderText('Add tag…');
    fireEvent.keyDown(input, { key: 'Backspace' });
    await waitFor(() => expect(onChangeSpy).toHaveBeenCalledWith(['finance']));
  });

  it('clicking × on a chip removes it', async () => {
    const onChangeSpy = vi.fn();
    render(<Harness initial={['finance']} onChangeSpy={onChangeSpy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove finance' }));
    await waitFor(() => expect(onChangeSpy).toHaveBeenCalledWith([]));
    expect(screen.queryByText('finance')).toBeNull();
  });

  it('does not add a duplicate chip', async () => {
    const onChangeSpy = vi.fn();
    render(<Harness initial={['finance']} onChangeSpy={onChangeSpy} />);
    const input = screen.getByPlaceholderText('Add tag…');
    fireEvent.change(input, { target: { value: 'finance' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('survives a failing suggestion fetch — input stays usable, no suggestions', async () => {
    mockApi.list.mockRejectedValue(new Error('network down'));
    render(<Harness />);
    const input = screen.getByPlaceholderText('Add tag…');
    fireEvent.change(input, { target: { value: 'fin' } });
    await waitFor(() => expect(mockApi.list).toHaveBeenCalledWith('fin'));
    expect(screen.queryByRole('option')).toBeNull();
    expect((input as HTMLInputElement).value).toBe('fin');
  });
});
