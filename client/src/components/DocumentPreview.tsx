import { api } from '../api.js';
import type { DocumentDTO } from '../types.js';
import './document-preview.css';

// Intentionally narrow allow-list. image/svg+xml is excluded because SVG can carry <script>
// and inline rendering would execute it under the app's origin.
const PREVIEWABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

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

  return null;
}
