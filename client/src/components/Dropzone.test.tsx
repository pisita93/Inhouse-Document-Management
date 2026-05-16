import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dropzone } from './Dropzone.js';

describe('Dropzone', () => {
  it('renders prompt text', () => {
    render(<Dropzone onFile={() => {}} />);
    expect(screen.getByText(/Drag & drop/i)).toBeTruthy();
  });

  it('calls onFile when a file is dropped', () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const zone = screen.getByTestId('dropzone');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('rejects files with disallowed extensions', () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const file = new File(['x'], 'a.exe', { type: 'application/x-msdownload' });
    const zone = screen.getByTestId('dropzone');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/Only PDF, JPG, PNG/i)).toBeTruthy();
  });
});
