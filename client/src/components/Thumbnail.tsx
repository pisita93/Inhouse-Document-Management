import { api } from '../api.js';
import { isPreviewableImage } from '../lib/mediaTypes.js';
import './thumbnail.css';

interface ThumbnailProps {
  id: string;
  mimeType: string;
  originalName: string;
}

function iconFor(mime: string): string {
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('image/')) return '🖼';
  return '📁';
}

export function Thumbnail({ id, mimeType, originalName }: ThumbnailProps) {
  if (isPreviewableImage(mimeType)) {
    return (
      <img
        className="thumbnail thumbnail--image"
        src={api.fileUrl(id, { inline: true })}
        alt={originalName}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span className="thumbnail thumbnail--icon" role="img" aria-label={mimeType}>
      {iconFor(mimeType)}
    </span>
  );
}
