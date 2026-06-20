import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaintenanceTab } from './MaintenanceTab.js';

afterEach(() => vi.restoreAllMocks());

describe('MaintenanceTab', () => {
  it('runs the sweep and shows the report', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ scanned: 10, removed: 2, bytesFreed: 2048 }), { status: 200 }),
    );
    render(<MaintenanceTab />);
    fireEvent.click(screen.getByRole('button', { name: /run orphan-file cleanup/i }));
    expect(await screen.findByText(/removed 2 orphans/i)).toBeTruthy();
  });
});
