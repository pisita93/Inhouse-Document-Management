import { Router, type Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import {
  DocumentCreateSchema,
  ListQuerySchema,
  type DocumentDTO,
} from '../../../shared/schemas.js';
import { ApiError } from '../middleware/errorHandler.js';
import { uploadMiddleware, sniffOrThrow, multerErrorAsApiError } from '../middleware/upload.js';
import type { createDocumentsRepo } from '../db/documentsRepo.js';
import type { FileStore } from '../storage/fileStore.js';

interface Deps {
  repo: ReturnType<typeof createDocumentsRepo>;
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

export function documentsRouter(deps: Deps): Router {
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
        const meta = DocumentCreateSchema.parse(rawMeta);

        const { mime, ext } = await sniffOrThrow(file.buffer);

        const id = uuidv4();
        const now = new Date().toISOString();
        const today = now.slice(0, 10);
        const filename = `${id}.${ext}`;

        await store.write(id, ext, now, file.buffer);

        const dto: DocumentDTO = {
          id,
          documentName: meta.documentName,
          type: meta.type,
          documentDate: today,
          invoiceDate: 'invoiceDate' in meta ? (meta.invoiceDate ?? null) : null,
          amount: 'amount' in meta ? (meta.amount ?? null) : null,
          currency: 'currency' in meta ? (meta.currency ?? null) : null,
          shortNote: meta.shortNote,
          note: meta.note,
          filename,
          originalName: file.originalname,
          mimeType: mime,
          sizeBytes: file.size,
          createdAt: now,
        };

        try {
          repo.insert(dto);
        } catch (e) {
          await store.unlink(id, ext, now);
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
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'document not found');
      res.json(dto);
    } catch (e) {
      next(e);
    }
  });

  r.get('/:id/file', (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      const dto = repo.getById(id);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'document not found');
      const ext = path.extname(dto.filename).slice(1);
      if (!store.exists(id, ext, dto.createdAt)) {
        throw new ApiError(410, 'FILE_GONE', 'file is no longer in storage');
      }
      res.setHeader('Content-Type', dto.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${dto.originalName.replace(/"/g, '')}"`,
      );
      store.openStream(id, ext, dto.createdAt).pipe(res);
    } catch (e) {
      next(e);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      const dto = repo.getById(id);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'document not found');
      const ext = path.extname(dto.filename).slice(1);
      repo.delete(id);
      await store.unlink(id, ext, dto.createdAt);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
