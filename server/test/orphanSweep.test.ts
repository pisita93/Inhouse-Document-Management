import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sweepOrphans } from '../src/storage/orphanSweep.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
  fs.mkdirSync(path.join(root, '2026', '01'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function writeOld(rel: string, content: string): string {
  const full = path.join(root, rel);
  fs.writeFileSync(full, content);
  const old = new Date(Date.now() - 5 * 60_000);
  fs.utimesSync(full, old, old);
  return full;
}

describe('sweepOrphans', () => {
  it('removes orphans, keeps known files, skips recent files', async () => {
    const orphan = writeOld('2026/01/orphan.pdf', 'gone');
    const known = writeOld('2026/01/keep.pdf', 'stay');
    const fresh = path.join(root, '2026', '01', 'fresh.pdf');
    fs.writeFileSync(fresh, 'new'); // mtime ~now → within guard

    const report = await sweepOrphans({ fileRoot: root, knownIds: new Set(['keep']) });

    expect(report.scanned).toBe(3);
    expect(report.removed).toBe(1);
    expect(report.bytesFreed).toBe(Buffer.byteLength('gone'));
    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(known)).toBe(true);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('dryRun reports candidates without deleting', async () => {
    const orphan = writeOld('2026/01/orphan.pdf', 'gone');
    const report = await sweepOrphans({ fileRoot: root, knownIds: new Set(), dryRun: true });
    expect(report.removed).toBe(1);
    expect(fs.existsSync(orphan)).toBe(true);
  });
});
