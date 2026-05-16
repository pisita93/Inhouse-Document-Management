import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';

describe('runMigrations', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-mig-'));
    fs.mkdirSync(path.join(tmpDir, 'db'), { recursive: true });
    dbPath = path.join(tmpDir, 'db', 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates receipts table and FTS5 mirror', () => {
    const db = openDatabase(dbPath);
    runMigrations(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','virtual')")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('receipts');
    expect(names).toContain('receipts_fts');
    db.close();
  });

  it('is idempotent (running twice does not fail)', () => {
    const db = openDatabase(dbPath);
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });

  it('enables WAL mode', () => {
    const db = openDatabase(dbPath);
    runMigrations(db);
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
    db.close();
  });

  it('enables foreign_keys', () => {
    const db = openDatabase(dbPath);
    runMigrations(db);
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
    db.close();
  });
});
