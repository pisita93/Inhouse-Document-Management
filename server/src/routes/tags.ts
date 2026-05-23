import express, { Router } from 'express';
import { ApiError } from '../middleware/errorHandler.js';
import { TagCreateSchema, TagPatchSchema } from '../../../shared/schemas.js';
import type { createTagsRepo } from '../db/tagsRepo.js';

interface Deps {
  repo: ReturnType<typeof createTagsRepo>;
}

export function tagsRouter({ repo }: Deps): Router {
  const r = Router();
  r.use(express.json());

  r.get('/', (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      res.json({ items: repo.list({ q }) });
    } catch (e) {
      next(e);
    }
  });

  r.post('/', (req, res, next) => {
    try {
      const parsed = TagCreateSchema.parse(req.body);
      const dto = repo.upsertByName(parsed.name);
      res.status(201).json(dto);
    } catch (e) {
      next(e);
    }
  });

  r.patch('/:id', (req, res, next) => {
    try {
      const parsed = TagPatchSchema.parse(req.body);
      const id = req.params.id ?? '';
      try {
        const dto = repo.rename(id, parsed.name);
        if (!dto) throw new ApiError(404, 'NOT_FOUND', 'tag not found');
        res.json(dto);
      } catch (e: unknown) {
        if (e instanceof Error && /UNIQUE/i.test(e.message)) {
          throw new ApiError(409, 'NAME_TAKEN', `tag '${parsed.name}' already exists`);
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
      if (!repo.delete(id)) throw new ApiError(404, 'NOT_FOUND', 'tag not found');
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
