import { Router } from 'express';
import { sweepOrphans } from '../storage/orphanSweep.js';
import type { createDocumentsRepo } from '../db/documentsRepo.js';

interface Deps {
  repo: ReturnType<typeof createDocumentsRepo>;
  fileRoot: string;
}

export function maintenanceRouter(deps: Deps): Router {
  const r = Router();
  r.post('/orphans/sweep', async (req, res, next) => {
    try {
      const dryRun = req.query.dryRun === 'true' || req.query.dryRun === '1';
      const knownIds = new Set(deps.repo.allIds());
      const minAgeMs = process.env.ORPHAN_SWEEP_MIN_AGE_MS
        ? Number(process.env.ORPHAN_SWEEP_MIN_AGE_MS)
        : undefined;
      const report = await sweepOrphans({ fileRoot: deps.fileRoot, knownIds, dryRun, minAgeMs });
      res.json(report);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
