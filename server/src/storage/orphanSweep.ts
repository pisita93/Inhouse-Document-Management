import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_ORPHAN_MIN_AGE_MS = 60_000;

export interface SweepOptions {
  fileRoot: string;
  knownIds: Set<string>;
  dryRun?: boolean;
  minAgeMs?: number;
  now?: number;
}

export interface SweepReport {
  scanned: number;
  removed: number;
  bytesFreed: number;
}

async function walkFiles(dir: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (e.isFile()) {
      files.push(full);
    }
  }
  return files;
}

export async function sweepOrphans(opts: SweepOptions): Promise<SweepReport> {
  const minAgeMs = opts.minAgeMs ?? DEFAULT_ORPHAN_MIN_AGE_MS;
  const now = opts.now ?? Date.now();
  const files = await walkFiles(opts.fileRoot);
  let removed = 0;
  let bytesFreed = 0;
  for (const file of files) {
    const id = path.basename(file, path.extname(file));
    if (opts.knownIds.has(id)) continue;
    const stat = await fsp.stat(file);
    if (now - stat.mtimeMs < minAgeMs) continue;
    if (!opts.dryRun) await fsp.unlink(file);
    removed += 1;
    bytesFreed += stat.size;
  }
  return { scanned: files.length, removed, bytesFreed };
}
