import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentPreview } from './DocumentPreview.js';
import type { DocumentDTO } from '../types.js';

const baseDoc: DocumentDTO = {
  id: 'doc-1',
  documentName: 'Sample',
  type: 'invoice',
  documentDate: '2026-05-21',
  invoiceDate: null,
  amount: null,
  currency: null,
  filename: 'sample.pdf',
  originalName: 'sample.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: '2026-05-21T00:00:00.000Z',
  category: null,
  tags: [],
};

describe('DocumentPreview', () => {
  it('renders an <img> for image MIME types pointing at the inline endpoint', () => {
    render(
      <DocumentPreview doc={{ ...baseDoc, mimeType: 'image/png', originalName: 'pic.png' }} />,
    );
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('/api/documents/doc-1/file?inline=1');
    expect(img.getAttribute('alt')).toBe('pic.png');
  });

  it('renders an <iframe> for application/pdf pointing at the inline endpoint', () => {
    render(<DocumentPreview doc={baseDoc} />);
    const frame = screen.getByTitle('sample.pdf');
    expect(frame.getAttribute('src')).toBe('/api/documents/doc-1/file?inline=1');
  });

  it('renders nothing for unsupported MIME types', () => {
    const { container } = render(
      <DocumentPreview
        doc={{
          ...baseDoc,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalName: 'memo.docx',
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does NOT inline image/svg+xml (script-execution risk) — renders nothing', () => {
    const { container } = render(
      <DocumentPreview doc={{ ...baseDoc, mimeType: 'image/svg+xml', originalName: 'icon.svg' }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('falls back to a default iframe title when originalName is empty', () => {
    render(<DocumentPreview doc={{ ...baseDoc, originalName: '' }} />);
    expect(screen.getByTitle('PDF preview')).toBeTruthy();
  });

  it('renders an <audio> player for playable audio MIME types', () => {
    const { container } = render(
      <DocumentPreview doc={{ ...baseDoc, mimeType: 'audio/mpeg', originalName: 'memo.mp3' }} />,
    );
    const audio = container.querySelector('audio');
    expect(audio).not.toBeNull();
    expect(audio!.getAttribute('src')).toBe('/api/documents/doc-1/file?inline=1');
  });

  it('renders a <video> player for playable video MIME types', () => {
    const { container } = render(
      <DocumentPreview doc={{ ...baseDoc, mimeType: 'video/mp4', originalName: 'clip.mp4' }} />,
    );
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe('/api/documents/doc-1/file?inline=1');
  });

  it('renders a download fallback (no media element) for non-playable media types', () => {
    const { container } = render(
      <DocumentPreview doc={{ ...baseDoc, mimeType: 'video/x-matroska', originalName: 'v.mkv' }} />,
    );
    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/api/documents/doc-1/file');
  });
});
