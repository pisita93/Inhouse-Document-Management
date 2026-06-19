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

  it('accepts an audio file (.m4a)', () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const file = new File(['x'], 'memo.m4a', { type: 'audio/mp4' });
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('accepts a video file (.mp4)', () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('rejects files with disallowed extensions', () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const file = new File(['x'], 'a.exe', { type: 'application/x-msdownload' });
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/Unsupported file type/i)).toBeTruthy();
  });
});
