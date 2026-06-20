import { api } from '../api.js';
import type { DocumentDTO } from '../types.js';
import { PREVIEWABLE_IMAGE_TYPES } from '../lib/mediaTypes.js';
import './document-preview.css';

const PLAYABLE_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
  'audio/x-flac',
]);

const PLAYABLE_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/x-m4v',
  'video/quicktime',
  'video/webm',
  'video/ogg',
]);

const isMediaType = (mime: string): boolean =>
  mime.startsWith('audio/') || mime.startsWith('video/');

interface Props {
  doc: DocumentDTO;
}

export function DocumentPreview({ doc }: Props) {
  const inlineSrc = api.fileUrl(doc.id, { inline: true });

  if (PREVIEWABLE_IMAGE_TYPES.has(doc.mimeType)) {
    return (
      <div className="document-preview document-preview--image">
        <img src={inlineSrc} alt={doc.originalName} />
      </div>
    );
  }

  if (doc.mimeType === 'application/pdf') {
    return (
      <div className="document-preview document-preview--pdf">
        <iframe src={inlineSrc} title={doc.originalName || 'PDF preview'} />
      </div>
    );
  }

  if (PLAYABLE_AUDIO_TYPES.has(doc.mimeType)) {
    return (
      <div className="document-preview document-preview--audio">
        <audio controls src={inlineSrc}>
          {doc.originalName}
        </audio>
      </div>
    );
  }

  if (PLAYABLE_VIDEO_TYPES.has(doc.mimeType)) {
    return (
      <div className="document-preview document-preview--video">
        <video controls src={inlineSrc} />
      </div>
    );
  }

  if (isMediaType(doc.mimeType)) {
    return (
      <div className="document-preview document-preview--fallback">
        <p>No inline preview available for this file type.</p>
        <a href={api.fileUrl(doc.id)}>Download {doc.originalName || 'file'}</a>
      </div>
    );
  }

  return null;
}
