import { Router, type Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import { DocumentCreateSchema, ListQuerySchema } from '../../../shared/schemas.js';
import { ApiError } from '../middleware/errorHandler.js';
import { uploadMiddleware, sniffOrThrow, multerErrorAsApiError } from '../middleware/upload.js';
import type { createDocumentsRepo, DocumentRowInput } from '../db/documentsRepo.js';
import type { createDocumentTypesRepo } from '../db/documentTypesRepo.js';
import type { createCategoriesRepo } from '../db/categoriesRepo.js';
import type { createTagsRepo } from '../db/tagsRepo.js';
import type { FileStore } from '../storage/fileStore.js';

interface Deps {
  repo: ReturnType<typeof createDocumentsRepo>;
  documentTypesRepo: ReturnType<typeof createDocumentTypesRepo>;
  categoriesRepo: ReturnType<typeof createCategoriesRepo>;
  tagsRepo: ReturnType<typeof createTagsRepo>;
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
  const { repo, documentTypesRepo, categoriesRepo, store } = deps;
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

        const type = documentTypesRepo.getById(meta.type);
        if (!type || type.disabledAt) {
          throw new ApiError(
            400,
            'UNKNOWN_OR_DISABLED_TYPE',
            `type '${meta.type}' is not available`,
          );
        }

        if (meta.categoryId) {
          const cat = categoriesRepo.getById(meta.categoryId);
          if (!cat || cat.disabledAt) {
            throw new ApiError(
              400,
              'UNKNOWN_OR_DISABLED_CATEGORY',
              `category '${meta.categoryId}' is not available`,
            );
          }
        }

        if (type.requiresFinancial) {
          if (
            meta.invoiceDate === undefined ||
            meta.amount === undefined ||
            meta.currency === undefined
          ) {
            throw new ApiError(
              400,
              'FINANCIAL_FIELDS_REQUIRED',
              `type '${type.id}' requires invoice_date, amount, currency`,
            );
          }
        }

        const { mime, ext } = await sniffOrThrow(file.buffer, file.originalname);

        const id = uuidv4();
        const now = new Date().toISOString();
        const today = now.slice(0, 10);
        const filename = `${id}.${ext}`;

        await store.write(id, ext, now, file.buffer);

        const rowInput: DocumentRowInput = {
          id,
          documentName: meta.documentName,
          type: meta.type,
          documentDate: today,
          invoiceDate: meta.invoiceDate ?? null,
          amount: meta.amount ?? null,
          currency: meta.currency ?? null,
          shortNote: meta.shortNote ?? null,
          note: meta.note ?? null,
          filename,
          originalName: file.originalname,
          mimeType: mime,
          sizeBytes: file.size,
          createdAt: now,
        };

        let dto;
        try {
          dto = repo.insertWithRelations({
            dto: rowInput,
            categoryId: meta.categoryId ?? null,
            tagNames: meta.tagNames ?? [],
          });
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
      const raw: Record<string, unknown> = { ...req.query };
      if (raw.tagIds !== undefined && !Array.isArray(raw.tagIds)) {
        raw.tagIds = [raw.tagIds];
      }
      const q = ListQuerySchema.parse(raw);
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
      const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="${dto.originalName.replace(/"/g, '')}"`,
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
