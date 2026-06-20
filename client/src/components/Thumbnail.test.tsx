import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Thumbnail } from './Thumbnail.js';

describe('Thumbnail', () => {
  it('renders an <img> at the inline endpoint for image types', () => {
    render(<Thumbnail id="abc" mimeType="image/png" originalName="pic.png" />);
    const img = screen.getByAltText('pic.png');
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toContain('/api/documents/abc/file');
  });

  it('renders a type icon for non-image types', () => {
    render(<Thumbnail id="abc" mimeType="application/pdf" originalName="d.pdf" />);
    expect(screen.getByLabelText('application/pdf').textContent).toBe('📄');
  });
});
