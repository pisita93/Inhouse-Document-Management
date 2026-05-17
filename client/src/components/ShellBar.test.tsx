import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShellBar } from './ShellBar.js';

describe('ShellBar', () => {
  it('renders the Inhouse DMS brand linking to the root', () => {
    render(
      <MemoryRouter>
        <ShellBar />
      </MemoryRouter>,
    );
    const brand = screen.getByRole('link', { name: /Inhouse DMS/i });
    expect(brand).toBeTruthy();
    expect(brand.getAttribute('href')).toBe('/');
  });

  it('renders the user avatar initials', () => {
    render(
      <MemoryRouter>
        <ShellBar />
      </MemoryRouter>,
    );
    expect(screen.getByText('PS')).toBeTruthy();
  });
});
