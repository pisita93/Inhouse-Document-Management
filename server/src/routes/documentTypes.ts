import express, { Router } from 'express';
import { ApiError } from '../middleware/errorHandler.js';
import { DocumentTypeCreateSchema, DocumentTypePatchSchema } from '../../../shared/schemas.js';
import type { createDocumentTypesRepo } from '../db/documentTypesRepo.js';

interface Deps {
  repo: ReturnType<typeof createDocumentTypesRepo>;
}

export function documentTypesRouter({ repo }: Deps): Router {
  const r = Router();
  r.use(express.json());

  r.get('/', (req, res, next) => {
    try {
      const includeDisabled = req.query.includeDisabled === 'true';
      res.json({ items: repo.list({ includeDisabled }) });
    } catch (e) {
      next(e);
    }
  });

  r.post('/', (req, res, next) => {
    try {
      const parsed = DocumentTypeCreateSchema.parse(req.body);
      try {
        const dto = repo.create(parsed);
        res.status(201).json(dto);
      } catch (e: unknown) {
        if (e instanceof Error && /UNIQUE/i.test(e.message)) {
          throw new ApiError(409, 'NAME_TAKEN', `type id '${parsed.id}' already exists`);
        }
        throw e;
      }
    } catch (e) {
      next(e);
    }
  });

  r.patch('/:id', (req, res, next) => {
    try {
      const parsed = DocumentTypePatchSchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        if (issue?.path?.[0] === 'requiresFinancial') {
          throw new ApiError(
            400,
            'REQUIRES_FINANCIAL_IMMUTABLE',
            'requires_financial is immutable',
          );
        }
        throw new ApiError(400, 'VALIDATION', issue?.message ?? 'validation error');
      }
      const id = req.params.id ?? '';
      const dto = repo.patch(id, parsed.data);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'document type not found');
      res.json(dto);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
