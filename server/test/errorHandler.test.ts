import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ApiError, errorHandler } from '../src/middleware/errorHandler.js';
import { z } from 'zod';

function buildApp(routeFn: express.RequestHandler) {
  const app = express();
  app.get('/x', routeFn);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('translates ApiError to envelope', async () => {
    const app = buildApp((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'gone')));
    const res = await request(app).get('/x');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'gone' } });
  });

  it('translates ZodError to 400 VALIDATION with fields', async () => {
    const schema = z.object({ a: z.number() });
    const app = buildApp((_req, _res, next) => {
      try {
        schema.parse({ a: 'no' });
      } catch (err) {
        next(err);
      }
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.fields).toHaveProperty('a');
  });

  it('falls back to 500 INTERNAL for unknown errors', async () => {
    const app = buildApp((_req, _res, next) => next(new Error('boom')));
    const res = await request(app).get('/x');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
  });
});
