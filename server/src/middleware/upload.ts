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

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

export async function sniffOrThrow(buf: Buffer): Promise<{ mime: string; ext: string }> {
  const detected = await fileTypeFromBuffer(buf);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw new ApiError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'File must be a document (PDF/JPG/PNG), audio, or video file',
    );
  }
  return { mime: detected.mime, ext: detected.ext };
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
