import express, { Router } from 'express';
import { ApiError } from '../middleware/errorHandler.js';
import { CategoryCreateSchema, CategoryPatchSchema } from '../../../shared/schemas.js';
import type { createCategoriesRepo } from '../db/categoriesRepo.js';

interface Deps {
  repo: ReturnType<typeof createCategoriesRepo>;
}

export function categoriesRouter({ repo }: Deps): Router {
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
      const parsed = CategoryCreateSchema.parse(req.body);
      try {
        const dto = repo.create(parsed);
        res.status(201).json(dto);
      } catch (e: unknown) {
        if (e instanceof Error && /UNIQUE/i.test(e.message)) {
          throw new ApiError(409, 'NAME_TAKEN', `category '${parsed.name}' already exists`);
        }
        throw e;
      }
    } catch (e) {
      next(e);
    }
  });

  r.patch('/:id', (req, res, next) => {
    try {
      const parsed = CategoryPatchSchema.parse(req.body);
      const id = req.params.id ?? '';
      try {
        const dto = repo.patch(id, parsed);
        if (!dto) throw new ApiError(404, 'NOT_FOUND', 'category not found');
        res.json(dto);
      } catch (e: unknown) {
        if (e instanceof Error && /UNIQUE/i.test(e.message)) {
          throw new ApiError(409, 'NAME_TAKEN', `category name already exists`);
        }
        throw e;
      }
    } catch (e) {
      next(e);
    }
  });

  r.delete('/:id', (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      if (!repo.delete(id)) throw new ApiError(404, 'NOT_FOUND', 'category not found');
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
