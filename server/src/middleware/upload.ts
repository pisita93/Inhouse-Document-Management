import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { ApiError } from './errorHandler.js';

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
export const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

export async function sniffOrThrow(buf: Buffer): Promise<{ mime: string; ext: string }> {
  const detected = await fileTypeFromBuffer(buf);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'File must be PDF, JPG, or PNG');
  }
  return { mime: detected.mime, ext: EXT_BY_MIME[detected.mime]! };
}

export function multerErrorAsApiError(err: unknown): ApiError | null {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(413, 'FILE_TOO_LARGE', 'File exceeds 25 MB');
    }
    return new ApiError(400, 'VALIDATION', err.message);
  }
  return null;
}
