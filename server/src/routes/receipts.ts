import { Router, type Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import { ReceiptCreateSchema, ListQuerySchema, type ReceiptDTO } from '@shared/schemas.js';
import { ApiError } from '../middleware/errorHandler.js';
import { uploadMiddleware, sniffOrThrow, multerErrorAsApiError } from '../middleware/upload.js';
import type { createReceiptsRepo } from '../db/receiptsRepo.js';
import type { FileStore } from '../storage/fileStore.js';

interface Deps {
  repo: ReturnType<typeof createReceiptsRepo>;
  store: FileStore;
}

function parseMetadata(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    throw new ApiError(400, 'VALIDATION', 'metadata field is required');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'VALIDATION', 'metadata is not valid JSON');
  }
}

export function receiptsRouter(deps: Deps): Router {
  const { repo, store } = deps;
  const r = Router();

  r.post('/', (req, res, next) => {
    uploadMiddleware(req, res, async (err) => {
      try {
        const mapped = multerErrorAsApiError(err);
        if (mapped) throw mapped;
        if (err) throw err;

        const file = (req as Request & { file?: Express.Multer.File }).file;
        if (!file) throw new ApiError(400, 'VALIDATION', 'file is required');

        const rawMeta = parseMetadata((req.body as Record<string, unknown>).metadata);
        const meta = ReceiptCreateSchema.parse(rawMeta);

        const { mime, ext } = await sniffOrThrow(file.buffer);

        const id = uuidv4();
        const now = new Date().toISOString();
        const filename = `${id}.${ext}`;

        await store.write(id, ext, meta.invoiceDate, file.buffer);

        const dto: ReceiptDTO = {
          id,
          ...meta,
          filename,
          originalName: file.originalname,
          mimeType: mime,
          sizeBytes: file.size,
          createdAt: now,
        };

        try {
          repo.insert(dto);
        } catch (e) {
          await store.unlink(id, ext, meta.invoiceDate);
          throw e;
        }

        res.status(201).json(dto);
      } catch (e) {
        next(e);
      }
    });
  });

  r.get('/', (req, res, next) => {
    try {
      const q = ListQuerySchema.parse(req.query);
      res.json(repo.list(q));
    } catch (e) {
      next(e);
    }
  });

  r.get('/:id', (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      const dto = repo.getById(id);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'receipt not found');
      res.json(dto);
    } catch (e) {
      next(e);
    }
  });

  r.get('/:id/file', (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      const dto = repo.getById(id);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'receipt not found');
      const ext = path.extname(dto.filename).slice(1);
      if (!store.exists(id, ext, dto.invoiceDate)) {
        throw new ApiError(410, 'FILE_GONE', 'file is no longer in storage');
      }
      res.setHeader('Content-Type', dto.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${dto.originalName.replace(/"/g, '')}"`,
      );
      store.openStream(id, ext, dto.invoiceDate).pipe(res);
    } catch (e) {
      next(e);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      const dto = repo.getById(id);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'receipt not found');
      const ext = path.extname(dto.filename).slice(1);
      repo.delete(id);
      await store.unlink(id, ext, dto.invoiceDate);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
