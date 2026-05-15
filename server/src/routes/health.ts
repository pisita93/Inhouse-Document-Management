import { Router } from 'express';

export function healthRouter(): Router {
  const r = Router();
  r.get('/', (_req, res) => {
    res.json({ ok: true, version: process.env.APP_VERSION ?? 'dev' });
  });
  return r;
}
