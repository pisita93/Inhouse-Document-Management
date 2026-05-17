import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypeChip } from './TypeChip.js';

describe('TypeChip', () => {
  it('renders the human label for a document type', () => {
    render(<TypeChip type="hr_document" />);
    expect(screen.getByText('HR Document')).toBeTruthy();
  });

  it('applies the accent variant class for financial types', () => {
    const { container } = render(<TypeChip type="invoice" />);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('fi-chip');
    expect(span.className).toContain('fi-chip--accent');
  });

  it('applies the ok variant for contract and certificate', () => {
    const { container: a } = render(<TypeChip type="contract" />);
    const { container: b } = render(<TypeChip type="certificate" />);
    expect(a.querySelector('span')!.className).toContain('fi-chip--ok');
    expect(b.querySelector('span')!.className).toContain('fi-chip--ok');
  });

  it('applies the warn variant for policy and purple for hr_document', () => {
    const { container: p } = render(<TypeChip type="policy" />);
    const { container: h } = render(<TypeChip type="hr_document" />);
    expect(p.querySelector('span')!.className).toContain('fi-chip--warn');
    expect(h.querySelector('span')!.className).toContain('fi-chip--purple');
  });

  it('omits any variant suffix for neutral types', () => {
    const { container } = render(<TypeChip type="other" />);
    const span = container.querySelector('span')!;
    expect(span.className.trim()).toBe('fi-chip');
  });
});
