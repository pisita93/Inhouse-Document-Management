// Narrow allow-list. image/svg+xml is excluded because SVG can carry <script>.
export const PREVIEWABLE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function isPreviewableImage(mime: string): boolean {
  return PREVIEWABLE_IMAGE_TYPES.has(mime);
}
