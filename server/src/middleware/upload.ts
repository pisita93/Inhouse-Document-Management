import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { ApiError } from './errorHandler.js';

export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

const DOCUMENT_MIME = ['application/pdf', 'image/jpeg', 'image/png'];

const AUDIO_MIME = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-ms-asf',
  'audio/amr',
];

const VIDEO_MIME = [
  'video/mp4',
  'video/x-m4v',
  'video/quicktime',
  'video/webm',
  'video/ogg',
  'video/mpeg',
  'video/vnd.avi',
  'video/x-matroska',
  'video/x-flv',
  'video/3gpp',
  'video/3gpp2',
  'video/mp2t',
  'video/x-ms-asf',
];

export const ALLOWED_MIME = new Set([...DOCUMENT_MIME, ...AUDIO_MIME, ...VIDEO_MIME]);

const TEXT_MIME = 'text/plain';
const TEXT_EXT = 'txt';

// Plain text has no magic-byte signature, so file-type cannot detect it. Accept it only
// when the upload is named .txt AND the bytes are valid UTF-8 with no NUL bytes — this stops
// a binary/executable from being smuggled past sniffing by renaming it .txt.
function looksLikeUtf8Text(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

export async function sniffOrThrow(
  buf: Buffer,
  originalName?: string,
): Promise<{ mime: string; ext: string }> {
  const detected = await fileTypeFromBuffer(buf);
  if (detected && ALLOWED_MIME.has(detected.mime)) {
    return { mime: detected.mime, ext: detected.ext };
  }
  if (!detected && originalName?.toLowerCase().endsWith('.txt') && looksLikeUtf8Text(buf)) {
    return { mime: TEXT_MIME, ext: TEXT_EXT };
  }
  throw new ApiError(
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    'File must be a document (PDF/JPG/PNG/TXT), audio, or video file',
  );
}

export function multerErrorAsApiError(err: unknown): ApiError | null {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(413, 'FILE_TOO_LARGE', 'File exceeds 200 MB');
    }
    return new ApiError(400, 'VALIDATION', err.message);
  }
  return null;
}
