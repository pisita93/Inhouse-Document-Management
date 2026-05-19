import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './connection.js';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

function tableExists(db: DB, name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name);
  return Boolean(row);
}

function columnExists(db: DB, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function ensureLedger(db: DB): Set<string> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  if (tableExists(db, 'documents')) {
    const seedAt = new Date().toISOString();
    const insert = db.prepare(
      `INSERT OR IGNORE INTO _migrations (filename, applied_at) VALUES (?, ?)`,
    );
    insert.run('001_init.sql', seedAt);
    insert.run('002_rename_to_documents.sql', seedAt);
    if (columnExists(db, 'documents', 'short_note')) {
      insert.run('003_short_note.sql', seedAt);
    }
  }
  const rows = db.prepare(`SELECT filename FROM _migrations`).all() as { filename: string }[];
  return new Set(rows.map((r) => r.filename));
}

export function runMigrations(db: DB, migrationsDir = MIGRATIONS_DIR): void {
  const applied = ensureLedger(db);
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const recordStmt = db.prepare(`INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)`);
  const txn = db.transaction(() => {
    const now = new Date().toISOString();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      db.exec(sql);
      recordStmt.run(file, now);
    }
  });
  txn();
}
