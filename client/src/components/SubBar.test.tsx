import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubBar } from './SubBar.js';

describe('SubBar', () => {
  it('renders the title content', () => {
    render(<SubBar title="Documents" />);
    expect(screen.getByText('Documents')).toBeTruthy();
  });

  it('renders an actions slot when provided', () => {
    render(<SubBar title="Documents" actions={<button>Upload</button>} />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy();
  });

  it('omits the actions container when no actions are passed', () => {
    const { container } = render(<SubBar title="Documents" />);
    expect(container.querySelector('.fi-subbar__actions')).toBeNull();
  });
});
