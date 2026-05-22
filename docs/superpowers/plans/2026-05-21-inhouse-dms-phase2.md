# Inhouse DMS Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship tags, categories, configurable document types, and inline PDF/image preview end-to-end — backend schema/API/migrations + admin UI + upload/browse integration + inline file-serving + detail-page preview + E2E coverage.

**Architecture:** Three new SQLite tables (`document_types`, `categories`, `tags`) plus a `document_tags` join. The `documents` table is rebuilt to drop its `CHECK` constraint on `type` and add a nullable `category_id` FK. FTS5 switches to a contentless table indexing five columns including joined tag/category names. The Zod schema moves from a hard-coded `requiresFinancials` set to a runtime lookup against `document_types`. UI grows a `/settings` admin page (three tabs) and extends the upload + browse forms.

**Tech Stack:** TypeScript, Express, better-sqlite3, Zod, React, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-19-inhouse-dms-phase2-design.md` (commit `6d25bc1`).

---

## Task 1: Migration 004 — schema rebuild, document_types seed, contentless FTS

**Files:**
- Create: `migrations/004_document_types.sql`
- Modify: `server/test/migrations.test.ts` (extend existing suite)

### Steps

- [ ] **Step 1: Write failing test — 004 against fresh schema**

Open `server/test/migrations.test.ts` and append:

```ts
describe('migration 004', () => {
  it('creates document_types, categories, tags, document_tags and rebuilds documents without CHECK', () => {
    const { db, dir } = setupTempDb();
    runMigrations(db, dir);

    // Tables exist
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        '_migrations',
        'categories',
        'document_tags',
        'document_types',
        'documents',
        'tags',
      ]),
    );

    // document_types seeded with 10 rows
    const typeCount = (
      db.prepare(`SELECT COUNT(*) as c FROM document_types`).get() as { c: number }
    ).c;
    expect(typeCount).toBe(10);

    // requires_financial = 1 for invoice and receipt, 0 for others
    const flags = db
      .prepare(`SELECT id, requires_financial FROM document_types ORDER BY id`)
      .all() as Array<{ id: string; requires_financial: number }>;
    expect(flags.find((r) => r.id === 'invoice')?.requires_financial).toBe(1);
    expect(flags.find((r) => r.id === 'receipt')?.requires_financial).toBe(1);
    expect(flags.find((r) => r.id === 'other')?.requires_financial).toBe(0);

    // documents has category_id, FK on type, no CHECK constraint
    const cols = db.prepare(`PRAGMA table_info(documents)`).all() as Array<{
      name: string;
      notnull: number;
    }>;
    expect(cols.find((c) => c.name === 'category_id')).toBeTruthy();
    const fks = db.prepare(`PRAGMA foreign_key_list(documents)`).all() as Array<{
      table: string;
      from: string;
      to: string;
    }>;
    expect(fks.some((f) => f.table === 'document_types' && f.from === 'type')).toBe(true);
    expect(fks.some((f) => f.table === 'categories' && f.from === 'category_id')).toBe(true);

    // FTS shape
    const ftsCols = db
      .prepare(`SELECT name FROM pragma_table_info('documents_fts')`)
      .all() as Array<{ name: string }>;
    expect(ftsCols.map((c) => c.name)).toEqual(
      expect.arrayContaining(['document_name', 'note', 'short_note', 'tag_names', 'category_name']),
    );

    db.close();
  });
});
```

If `setupTempDb()` doesn't exist, extract it from the existing test using whatever pattern is already in place. Reuse, don't duplicate.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test -- migrations`
Expected: FAIL — "no such table: document_types" (or similar; 004 doesn't exist yet).

- [ ] **Step 3: Create the migration file**

Create `migrations/004_document_types.sql`:

```sql
-- Phase 2: configurable document types, categories, tags, contentless FTS rebuild.

CREATE TABLE document_types (
  id                  TEXT PRIMARY KEY,
  label               TEXT NOT NULL,
  requires_financial  INTEGER NOT NULL DEFAULT 0 CHECK(requires_financial IN (0,1)),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  disabled_at         TEXT,
  created_at          TEXT NOT NULL
);

CREATE TABLE categories (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  disabled_at  TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at  TEXT NOT NULL
);

CREATE TABLE document_tags (
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id       TEXT NOT NULL REFERENCES tags(id)      ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);
CREATE INDEX idx_document_tags_tag ON document_tags(tag_id);

INSERT INTO document_types (id, label, requires_financial, sort_order, created_at) VALUES
  ('invoice',          'Invoice',           1, 10, datetime('now')),
  ('receipt',          'Receipt',           1, 20, datetime('now')),
  ('quotation',        'Quotation',         0, 30, datetime('now')),
  ('contract',         'Contract',          0, 40, datetime('now')),
  ('policy',           'Policy',            0, 50, datetime('now')),
  ('hr_document',      'HR Document',       0, 60, datetime('now')),
  ('meeting_minutes',  'Meeting Minutes',   0, 70, datetime('now')),
  ('report',           'Report',            0, 80, datetime('now')),
  ('certificate',      'Certificate',       0, 90, datetime('now')),
  ('other',            'Other',             0, 99, datetime('now'));

-- Drop existing FTS and triggers (rebuild with new shape below).
DROP TRIGGER IF EXISTS documents_ai;
DROP TRIGGER IF EXISTS documents_ad;
DROP TABLE   IF EXISTS documents_fts;

-- Rebuild documents: drop CHECK on type, add FKs and category_id.
CREATE TABLE documents_new (
  id              TEXT PRIMARY KEY,
  document_name   TEXT NOT NULL,
  type            TEXT NOT NULL REFERENCES document_types(id),
  category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
  document_date   TEXT NOT NULL,
  invoice_date    TEXT,
  amount          INTEGER CHECK(amount IS NULL OR amount >= 0),
  currency        TEXT    CHECK(currency IS NULL OR currency IN ('THB','USD','EUR','JPY','CNY')),
  note            TEXT,
  short_note      TEXT,
  filename        TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at      TEXT NOT NULL
);

INSERT INTO documents_new (
  id, document_name, type, category_id, document_date, invoice_date,
  amount, currency, note, short_note, filename, original_name, mime_type,
  size_bytes, created_at
)
SELECT id, document_name, type, NULL, document_date, invoice_date,
       amount, currency, note, short_note, filename, original_name, mime_type,
       size_bytes, created_at
FROM documents;

DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE INDEX idx_documents_document_date ON documents(document_date);
CREATE INDEX idx_documents_invoice_date  ON documents(invoice_date);
CREATE INDEX idx_documents_type          ON documents(type);
CREATE INDEX idx_documents_category      ON documents(category_id);
CREATE INDEX idx_documents_created_at    ON documents(created_at);

-- Contentless FTS5 over document_name, note, short_note, tag_names, category_name.
CREATE VIRTUAL TABLE documents_fts USING fts5(
  document_name, note, short_note, tag_names, category_name,
  content=''
);

-- Helper expression used by triggers: joined tag names for a doc.
-- (Inline in triggers because SQLite has no scalar UDFs from .sql.)

CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, document_name, note, short_note, tag_names, category_name)
  VALUES (
    new.rowid,
    new.document_name,
    COALESCE(new.note, ''),
    COALESCE(new.short_note, ''),
    COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
              FROM tags t JOIN document_tags dt ON dt.tag_id = t.id
              WHERE dt.document_id = new.id), ''),
    COALESCE((SELECT name FROM categories WHERE id = new.category_id), '')
  );
END;

CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, document_name, note, short_note, tag_names, category_name)
  VALUES ('delete', old.rowid,
    old.document_name,
    COALESCE(old.note, ''),
    COALESCE(old.short_note, ''),
    COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
              FROM tags t JOIN document_tags dt ON dt.tag_id = t.id
              WHERE dt.document_id = old.id), ''),
    COALESCE((SELECT name FROM categories WHERE id = old.category_id), ''));
  INSERT INTO documents_fts(rowid, document_name, note, short_note, tag_names, category_name)
  VALUES (
    new.rowid,
    new.document_name,
    COALESCE(new.note, ''),
    COALESCE(new.short_note, ''),
    COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
              FROM tags t JOIN document_tags dt ON dt.tag_id = t.id
              WHERE dt.document_id = new.id), ''),
    COALESCE((SELECT name FROM categories WHERE id = new.category_id), '')
  );
END;

CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, document_name, note, short_note, tag_names, category_name)
  VALUES ('delete', old.rowid,
    old.document_name,
    COALESCE(old.note, ''),
    COALESCE(old.short_note, ''),
    COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
              FROM tags t JOIN document_tags dt ON dt.tag_id = t.id
              WHERE dt.document_id = old.id), ''),
    COALESCE((SELECT name FROM categories WHERE id = old.category_id), ''));
END;

-- Tag join triggers: refresh tag_names for the affected document.
CREATE TRIGGER document_tags_ai AFTER INSERT ON document_tags BEGIN
  UPDATE documents SET document_name = document_name WHERE id = new.document_id;
END;

CREATE TRIGGER document_tags_ad AFTER DELETE ON document_tags BEGIN
  UPDATE documents SET document_name = document_name WHERE id = old.document_id;
END;

-- Category rename trigger: refresh category_name for every doc in that category.
CREATE TRIGGER categories_au AFTER UPDATE OF name ON categories BEGIN
  UPDATE documents SET document_name = document_name WHERE category_id = new.id;
END;

-- Backfill FTS for any existing documents.
INSERT INTO documents_fts(rowid, document_name, note, short_note, tag_names, category_name)
  SELECT d.rowid, d.document_name, COALESCE(d.note, ''), COALESCE(d.short_note, ''), '', ''
  FROM documents d;
```

**Why the `UPDATE documents SET document_name = document_name` trick:** it triggers `documents_au` to recompute the FTS row from joined data, without altering any column. This is the standard SQLite idiom for "re-emit FTS for this row" because FTS5 can't be partially updated.

- [ ] **Step 4: Run the test again — confirm green**

Run: `npm --workspace server test -- migrations`
Expected: PASS for the new test; existing migration tests still pass.

- [ ] **Step 5: Write failing test — every seeded type inserts under the new schema**

> Honest scope: this test seeds rows **after** 004 runs, proving the rebuilt `documents` table accepts every seeded type id under the new FK. It does **not** prove that pre-existing pre-004 rows survive the `INSERT … SELECT FROM documents` rebuild — `runMigrations` runs all migrations in one shot, so there's no pre-004 seam to wedge data into. Pre-existing-row survival is covered manually in Task 1 Step 9b (prod-data check) below.

Append to `server/test/migrations.test.ts`:

```ts
it('accepts a row of every seeded type under the new schema', () => {
  const { db, dir } = setupTempDb();
  runMigrations(db, dir); // runs all including 004
  const insert = db.prepare(`
    INSERT INTO documents (id, document_name, type, category_id, document_date,
      invoice_date, amount, currency, note, short_note, filename, original_name,
      mime_type, size_bytes, created_at)
    VALUES (?, ?, ?, NULL, '2026-05-21', NULL, NULL, NULL, NULL, NULL,
      'f.pdf', 'f.pdf', 'application/pdf', 1, datetime('now'))
  `);
  const ids = [
    'invoice','receipt','quotation','contract','policy',
    'hr_document','meeting_minutes','report','certificate','other',
  ].map((t, i) => {
    const id = `doc-${i}`;
    insert.run(id, `name-${t}`, t);
    return id;
  });

  // All rows accepted (FK resolves)
  const count = (db.prepare(`SELECT COUNT(*) c FROM documents`).get() as { c: number }).c;
  expect(count).toBe(10);

  // FTS rows match
  const ftsCount = (db.prepare(`SELECT COUNT(*) c FROM documents_fts`).get() as { c: number })
    .c;
  expect(ftsCount).toBe(10);

  db.close();
});
```

- [ ] **Step 6: Run; verify pass**

Run: `npm --workspace server test -- migrations`
Expected: PASS.

- [ ] **Step 7: Write failing test — idempotency**

Append:

```ts
it('is idempotent — re-running 004 is a no-op', () => {
  const { db, dir } = setupTempDb();
  runMigrations(db, dir);
  const before = (
    db.prepare(`SELECT COUNT(*) c FROM document_types`).get() as { c: number }
  ).c;
  runMigrations(db, dir); // second run
  const after = (
    db.prepare(`SELECT COUNT(*) c FROM document_types`).get() as { c: number }
  ).c;
  expect(after).toBe(before);
  db.close();
});
```

- [ ] **Step 8: Run; verify pass**

Run: `npm --workspace server test -- migrations`
Expected: PASS.

- [ ] **Step 9: Confirm full server suite still green**

Run: `npm --workspace server test`
Expected: All passing. If any old test references the old `documents.type` `CHECK` or the old FTS shape, fix it inline before committing.

- [ ] **Step 9b: Prod-data FK backstop (manual)**

The rebuild `INSERT INTO documents_new (…, type, …) SELECT (…, type, …) FROM documents` does **not** validate that every existing `documents.type` value is one of the 10 seeded ids — the FK fires later, on insert into `documents_new`. If any prod row has a `type` outside the seeded set, the migration aborts and the table is left half-rebuilt (the SQL runs in an implicit transaction per `runMigrations`, so it rolls back, but the failure is opaque).

Against the real `.local-data/dms.sqlite` (or whichever DB the dev server uses), before merging:

```bash
sqlite3 .local-data/dms.sqlite "SELECT DISTINCT type FROM documents;"
```

Confirm every value is in: `invoice, receipt, quotation, contract, policy, hr_document, meeting_minutes, report, certificate, other`. If anything else exists, document the remap in a new step before 004 runs (a one-off `UPDATE documents SET type = '…' WHERE type = '…'` inside 004, **above** the table rebuild).

- [ ] **Step 10: Commit**

```bash
git add migrations/004_document_types.sql server/test/migrations.test.ts
git commit -m "feat(db): migration 004 — document_types, categories, tags, contentless FTS"
```

---

## Task 2: `document_types` repo + routes

**Files:**
- Create: `server/src/db/documentTypesRepo.ts`
- Create: `server/src/routes/documentTypes.ts`
- Create: `server/test/documentTypes.test.ts`
- Modify: `server/src/app.ts` — wire the router
- Modify: `shared/schemas.ts` — add `DocumentTypeDTOSchema`, `DocumentTypeCreateSchema`, `DocumentTypePatchSchema`

### Steps

- [ ] **Step 1: Add schemas to `shared/schemas.ts`**

Append to `shared/schemas.ts`:

```ts
export const DocumentTypeIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'snake_case, 1-40 chars');

export const DocumentTypeLabelSchema = z.string().trim().min(1).max(60);

export const DocumentTypeDTOSchema = z.object({
  id: DocumentTypeIdSchema,
  label: DocumentTypeLabelSchema,
  requiresFinancial: z.boolean(),
  sortOrder: z.number().int(),
  disabledAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DocumentTypeDTO = z.infer<typeof DocumentTypeDTOSchema>;

export const DocumentTypeCreateSchema = z.object({
  id: DocumentTypeIdSchema,
  label: DocumentTypeLabelSchema,
  requiresFinancial: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});
export type DocumentTypeCreate = z.infer<typeof DocumentTypeCreateSchema>;

export const DocumentTypePatchSchema = z
  .object({
    label: DocumentTypeLabelSchema.optional(),
    sortOrder: z.number().int().optional(),
    disabledAt: z.string().nullable().optional(),
    requiresFinancial: z.unknown().optional(), // present-but-rejected
  })
  .refine((v) => v.requiresFinancial === undefined, {
    message: 'requires_financial is immutable',
    path: ['requiresFinancial'],
  });
export type DocumentTypePatch = z.infer<typeof DocumentTypePatchSchema>;
```

- [ ] **Step 2: Write failing test for repo**

Create `server/test/documentTypes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setupTempDb } from './testReset';
import { runMigrations } from '../src/db/migrations';
import { createDocumentTypesRepo } from '../src/db/documentTypesRepo';

describe('documentTypesRepo', () => {
  let db: ReturnType<typeof setupTempDb>['db'];
  let dir: string;
  let repo: ReturnType<typeof createDocumentTypesRepo>;

  beforeEach(() => {
    const tmp = setupTempDb();
    db = tmp.db;
    dir = tmp.dir;
    runMigrations(db, dir);
    repo = createDocumentTypesRepo(db);
  });

  it('lists seeded types in sort_order', () => {
    const items = repo.list({ includeDisabled: false });
    expect(items).toHaveLength(10);
    expect(items[0]?.id).toBe('invoice');
    expect(items[items.length - 1]?.id).toBe('other');
  });

  it('hides disabled types by default; includeDisabled returns them', () => {
    repo.patch('other', { disabledAt: new Date().toISOString() });
    expect(repo.list({ includeDisabled: false }).map((t) => t.id)).not.toContain('other');
    expect(repo.list({ includeDisabled: true }).map((t) => t.id)).toContain('other');
  });

  it('create + getById', () => {
    repo.create({
      id: 'tax_form',
      label: 'Tax Form',
      requiresFinancial: true,
      sortOrder: 50,
    });
    const got = repo.getById('tax_form');
    expect(got?.requiresFinancial).toBe(true);
  });

  it('patch updates label/sort/disabledAt but not requiresFinancial', () => {
    repo.patch('contract', { label: 'Legal Contract', sortOrder: 35 });
    const got = repo.getById('contract');
    expect(got?.label).toBe('Legal Contract');
    expect(got?.sortOrder).toBe(35);
  });

  it('name uniqueness on create (case-insensitive)', () => {
    expect(() => repo.create({ id: 'INVOICE', label: 'X', requiresFinancial: false, sortOrder: 0 })).toThrow();
  });
});
```

- [ ] **Step 3: Run; verify fail**

Run: `npm --workspace server test -- documentTypes`
Expected: FAIL — "Cannot find module".

- [ ] **Step 4: Create the repo**

Create `server/src/db/documentTypesRepo.ts`:

```ts
import type { DB } from './connection.js';
import type { DocumentTypeDTO, DocumentTypeCreate, DocumentTypePatch } from '../../../shared/schemas.js';

interface Row {
  id: string;
  label: string;
  requires_financial: number;
  sort_order: number;
  disabled_at: string | null;
  created_at: string;
}

function rowToDTO(r: Row): DocumentTypeDTO {
  return {
    id: r.id,
    label: r.label,
    requiresFinancial: r.requires_financial === 1,
    sortOrder: r.sort_order,
    disabledAt: r.disabled_at,
    createdAt: r.created_at,
  };
}

export function createDocumentTypesRepo(db: DB) {
  const insertStmt = db.prepare(`
    INSERT INTO document_types (id, label, requires_financial, sort_order, created_at)
    VALUES (@id, @label, @requires_financial, @sort_order, @created_at)
  `);
  const getStmt = db.prepare(`SELECT * FROM document_types WHERE id = ?`);
  const listAllStmt = db.prepare(`SELECT * FROM document_types ORDER BY sort_order, id`);
  const listActiveStmt = db.prepare(
    `SELECT * FROM document_types WHERE disabled_at IS NULL ORDER BY sort_order, id`,
  );

  return {
    list({ includeDisabled }: { includeDisabled: boolean }): DocumentTypeDTO[] {
      const stmt = includeDisabled ? listAllStmt : listActiveStmt;
      return (stmt.all() as Row[]).map(rowToDTO);
    },

    getById(id: string): DocumentTypeDTO | null {
      const row = getStmt.get(id) as Row | undefined;
      return row ? rowToDTO(row) : null;
    },

    create(input: DocumentTypeCreate): DocumentTypeDTO {
      insertStmt.run({
        id: input.id,
        label: input.label,
        requires_financial: input.requiresFinancial ? 1 : 0,
        sort_order: input.sortOrder,
        created_at: new Date().toISOString(),
      });
      const got = this.getById(input.id);
      if (!got) throw new Error('insert succeeded but row missing');
      return got;
    },

    patch(id: string, patch: DocumentTypePatch): DocumentTypeDTO | null {
      const sets: string[] = [];
      const params: Record<string, unknown> = { id };
      if (patch.label !== undefined) {
        sets.push('label = @label');
        params.label = patch.label;
      }
      if (patch.sortOrder !== undefined) {
        sets.push('sort_order = @sort_order');
        params.sort_order = patch.sortOrder;
      }
      if (patch.disabledAt !== undefined) {
        sets.push('disabled_at = @disabled_at');
        params.disabled_at = patch.disabledAt;
      }
      if (sets.length === 0) return this.getById(id);
      db.prepare(`UPDATE document_types SET ${sets.join(', ')} WHERE id = @id`).run(params);
      return this.getById(id);
    },
  };
}
```

- [ ] **Step 5: Run repo tests — verify pass**

Run: `npm --workspace server test -- documentTypes`
Expected: 5 PASS.

- [ ] **Step 6: Write failing test for routes**

Append to `server/test/documentTypes.test.ts`:

```ts
import { createApp } from '../src/app';
import request from 'supertest';

describe('documentTypes routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const tmp = setupTempDb();
    runMigrations(tmp.db, tmp.dir);
    app = createApp({ db: tmp.db, /* stub fileStore as in existing route tests */ } as any);
  });

  it('GET /api/document-types lists enabled types', async () => {
    const res = await request(app).get('/api/document-types');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(10);
  });

  it('POST creates a type with requiresFinancial', async () => {
    const res = await request(app)
      .post('/api/document-types')
      .send({ id: 'tax_form', label: 'Tax Form', requiresFinancial: true, sortOrder: 55 });
    expect(res.status).toBe(201);
    expect(res.body.requiresFinancial).toBe(true);
  });

  it('PATCH rejects requiresFinancial in body', async () => {
    const res = await request(app)
      .patch('/api/document-types/contract')
      .send({ requiresFinancial: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUIRES_FINANCIAL_IMMUTABLE');
  });

  it('PATCH allows rename/disable', async () => {
    const res = await request(app)
      .patch('/api/document-types/other')
      .send({ disabledAt: new Date().toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.disabledAt).toBeTruthy();
  });
});
```

> Note: copy the exact `createApp` wiring from how `server/test/list.test.ts` instantiates the app — keep test setup identical to existing patterns. Specifically: look for the `beforeEach` block at the top of that file that calls `createApp({ db, store })` and reuse the same `store` stub (typically a fake `FileStore` returning fixed paths). Don't invent a new stub shape.

- [ ] **Step 7: Run; verify fail**

Run: `npm --workspace server test -- documentTypes`
Expected: FAIL — route 404 or missing handler.

- [ ] **Step 8: Create the router**

Create `server/src/routes/documentTypes.ts`:

```ts
import { Router } from 'express';
import { ApiError } from '../middleware/errorHandler.js';
import {
  DocumentTypeCreateSchema,
  DocumentTypePatchSchema,
} from '../../../shared/schemas.js';
import type { createDocumentTypesRepo } from '../db/documentTypesRepo.js';

interface Deps {
  repo: ReturnType<typeof createDocumentTypesRepo>;
}

export function documentTypesRouter({ repo }: Deps): Router {
  const r = Router();

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
          throw new ApiError(400, 'REQUIRES_FINANCIAL_IMMUTABLE', 'requires_financial is immutable');
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
```

- [ ] **Step 9: Wire the router into `app.ts`**

Modify `server/src/app.ts`:
- Add import: `import { documentTypesRouter } from './routes/documentTypes.js';`
- After `createDocumentsRepo(db)`, add `const documentTypesRepo = createDocumentTypesRepo(db);`
- Mount: `app.use('/api/document-types', documentTypesRouter({ repo: documentTypesRepo }));`

Show the actual surrounding code with these additions in place — read `server/src/app.ts` first if uncertain about exact placement.

- [ ] **Step 10: Run route tests — verify pass**

Run: `npm --workspace server test -- documentTypes`
Expected: 9 PASS (5 repo + 4 routes).

- [ ] **Step 11: Run full server suite — confirm no regression**

Run: `npm --workspace server test`
Expected: All passing.

- [ ] **Step 12: Commit**

```bash
git add shared/schemas.ts server/src/db/documentTypesRepo.ts server/src/routes/documentTypes.ts server/src/app.ts server/test/documentTypes.test.ts
git commit -m "feat(api): document_types repo + routes with immutable requires_financial"
```

---

## Task 3: `categories` repo + routes

**Files:**
- Create: `server/src/db/categoriesRepo.ts`
- Create: `server/src/routes/categories.ts`
- Create: `server/test/categories.test.ts`
- Modify: `server/src/app.ts` — wire router
- Modify: `shared/schemas.ts` — add `CategoryDTOSchema`, `CategoryCreateSchema`, `CategoryPatchSchema`

### Steps

- [ ] **Step 1: Add schemas**

Append to `shared/schemas.ts`:

```ts
export const CategoryNameSchema = z.string().trim().min(1).max(60);

export const CategoryDTOSchema = z.object({
  id: z.string().uuid(),
  name: CategoryNameSchema,
  sortOrder: z.number().int(),
  disabledAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CategoryDTO = z.infer<typeof CategoryDTOSchema>;

export const CategoryCreateSchema = z.object({
  name: CategoryNameSchema,
  sortOrder: z.number().int().default(0),
});
export type CategoryCreate = z.infer<typeof CategoryCreateSchema>;

export const CategoryPatchSchema = z.object({
  name: CategoryNameSchema.optional(),
  sortOrder: z.number().int().optional(),
  disabledAt: z.string().nullable().optional(),
});
export type CategoryPatch = z.infer<typeof CategoryPatchSchema>;
```

- [ ] **Step 2: Write failing tests**

Create `server/test/categories.test.ts`. Cover: create, list (incl. disabled toggle), patch rename, patch disable, delete cascades to `documents.category_id = NULL`, name uniqueness 409. Follow the exact structure from `server/test/documentTypes.test.ts` (Task 2 Step 6). Include both repo-level and route-level tests in the same file (mirrors existing convention).

- [ ] **Step 3: Run; verify fail**

Run: `npm --workspace server test -- categories`
Expected: FAIL — module missing.

- [ ] **Step 4: Create the repo**

Create `server/src/db/categoriesRepo.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import type { DB } from './connection.js';
import type { CategoryDTO, CategoryCreate, CategoryPatch } from '../../../shared/schemas.js';

interface Row {
  id: string;
  name: string;
  sort_order: number;
  disabled_at: string | null;
  created_at: string;
}

function rowToDTO(r: Row): CategoryDTO {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    disabledAt: r.disabled_at,
    createdAt: r.created_at,
  };
}

export function createCategoriesRepo(db: DB) {
  const insertStmt = db.prepare(`
    INSERT INTO categories (id, name, sort_order, created_at)
    VALUES (@id, @name, @sort_order, @created_at)
  `);
  const getStmt = db.prepare(`SELECT * FROM categories WHERE id = ?`);
  const deleteStmt = db.prepare(`DELETE FROM categories WHERE id = ?`);
  const listAllStmt = db.prepare(`SELECT * FROM categories ORDER BY sort_order, name`);
  const listActiveStmt = db.prepare(
    `SELECT * FROM categories WHERE disabled_at IS NULL ORDER BY sort_order, name`,
  );

  return {
    list({ includeDisabled }: { includeDisabled: boolean }): CategoryDTO[] {
      const stmt = includeDisabled ? listAllStmt : listActiveStmt;
      return (stmt.all() as Row[]).map(rowToDTO);
    },

    getById(id: string): CategoryDTO | null {
      const row = getStmt.get(id) as Row | undefined;
      return row ? rowToDTO(row) : null;
    },

    create(input: CategoryCreate): CategoryDTO {
      const id = uuidv4();
      insertStmt.run({
        id,
        name: input.name,
        sort_order: input.sortOrder,
        created_at: new Date().toISOString(),
      });
      const got = this.getById(id);
      if (!got) throw new Error('insert succeeded but row missing');
      return got;
    },

    patch(id: string, patch: CategoryPatch): CategoryDTO | null {
      const sets: string[] = [];
      const params: Record<string, unknown> = { id };
      if (patch.name !== undefined) {
        sets.push('name = @name');
        params.name = patch.name;
      }
      if (patch.sortOrder !== undefined) {
        sets.push('sort_order = @sort_order');
        params.sort_order = patch.sortOrder;
      }
      if (patch.disabledAt !== undefined) {
        sets.push('disabled_at = @disabled_at');
        params.disabled_at = patch.disabledAt;
      }
      if (sets.length === 0) return this.getById(id);
      db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = @id`).run(params);
      return this.getById(id);
    },

    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
```

- [ ] **Step 5: Create the router**

Create `server/src/routes/categories.ts`. Pattern mirrors `documentTypes.ts` (Task 2 Step 8). Notable differences:
- `POST /` body is `CategoryCreateSchema` (no `id` from client; server generates UUID).
- `DELETE /:id` returns 204 on success, 404 if missing. No special handling for in-use rows — FK cascades `category_id` to NULL.
- Unique violation on name → 409 `NAME_TAKEN`.

```ts
import { Router } from 'express';
import { ApiError } from '../middleware/errorHandler.js';
import { CategoryCreateSchema, CategoryPatchSchema } from '../../../shared/schemas.js';
import type { createCategoriesRepo } from '../db/categoriesRepo.js';

interface Deps {
  repo: ReturnType<typeof createCategoriesRepo>;
}

export function categoriesRouter({ repo }: Deps): Router {
  const r = Router();

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
      const dto = repo.patch(id, parsed);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'category not found');
      res.json(dto);
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
```

- [ ] **Step 6: Wire router in `app.ts`**

Add: `import { categoriesRouter } from './routes/categories.js';`
Add: `const categoriesRepo = createCategoriesRepo(db);`
Mount: `app.use('/api/categories', categoriesRouter({ repo: categoriesRepo }));`

- [ ] **Step 7: Run; verify pass**

Run: `npm --workspace server test -- categories`
Expected: All tests PASS.

- [ ] **Step 8: Full server suite**

Run: `npm --workspace server test`
Expected: All passing.

- [ ] **Step 9: Commit**

```bash
git add shared/schemas.ts server/src/db/categoriesRepo.ts server/src/routes/categories.ts server/src/app.ts server/test/categories.test.ts
git commit -m "feat(api): categories repo + routes with delete-sets-FK-null cascade"
```

---

## Task 4: `tags` repo + routes

**Files:**
- Create: `server/src/db/tagsRepo.ts`
- Create: `server/src/routes/tags.ts`
- Create: `server/test/tags.test.ts`
- Modify: `server/src/app.ts`
- Modify: `shared/schemas.ts` — add tag schemas

### Steps

- [ ] **Step 1: Add schemas**

Append to `shared/schemas.ts`:

```ts
export const TagNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9 _-]*$/, 'letters, digits, space, _, - only');

export const TagDTOSchema = z.object({
  id: z.string().uuid(),
  name: TagNameSchema,
  createdAt: z.string(),
});
export type TagDTO = z.infer<typeof TagDTOSchema>;

export const TagCreateSchema = z.object({ name: TagNameSchema });
export type TagCreate = z.infer<typeof TagCreateSchema>;

export const TagPatchSchema = z.object({ name: TagNameSchema });
export type TagPatch = z.infer<typeof TagPatchSchema>;
```

- [ ] **Step 2: Write failing tests for repo**

Create `server/test/tags.test.ts`. Cover:
- `upsertByName('Finance ')` lowercases and trims to `finance`, returns the same id when called twice.
- `list()` returns alphabetical.
- `list({ q: 'fin' })` returns matches via `LIKE '%fin%'` case-insensitive.
- `rename` updates name.
- `delete` cascades — pre-link a tag to a doc, delete the tag, verify `document_tags` row gone.
- Name uniqueness conflict throws on `rename`.

Structure mirrors Task 3 Step 2.

- [ ] **Step 3: Run; verify fail**

Run: `npm --workspace server test -- tags`
Expected: FAIL.

- [ ] **Step 4: Create the repo**

Create `server/src/db/tagsRepo.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import type { DB } from './connection.js';
import type { TagDTO } from '../../../shared/schemas.js';

interface Row {
  id: string;
  name: string;
  created_at: string;
}

function rowToDTO(r: Row): TagDTO {
  return { id: r.id, name: r.name, createdAt: r.created_at };
}

export function createTagsRepo(db: DB) {
  const insertStmt = db.prepare(
    `INSERT INTO tags (id, name, created_at) VALUES (@id, @name, @created_at)`,
  );
  const getByNameStmt = db.prepare(`SELECT * FROM tags WHERE name = ? COLLATE NOCASE`);
  const getByIdStmt = db.prepare(`SELECT * FROM tags WHERE id = ?`);
  const listAllStmt = db.prepare(`SELECT * FROM tags ORDER BY name`);
  const listQueryStmt = db.prepare(
    `SELECT * FROM tags WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 50`,
  );
  const renameStmt = db.prepare(`UPDATE tags SET name = ? WHERE id = ?`);
  const deleteStmt = db.prepare(`DELETE FROM tags WHERE id = ?`);

  return {
    list({ q }: { q?: string }): TagDTO[] {
      if (q && q.length > 0) {
        return (listQueryStmt.all(`%${q}%`) as Row[]).map(rowToDTO);
      }
      return (listAllStmt.all() as Row[]).map(rowToDTO);
    },

    getById(id: string): TagDTO | null {
      const row = getByIdStmt.get(id) as Row | undefined;
      return row ? rowToDTO(row) : null;
    },

    getByName(name: string): TagDTO | null {
      const row = getByNameStmt.get(name) as Row | undefined;
      return row ? rowToDTO(row) : null;
    },

    upsertByName(rawName: string): TagDTO {
      const name = rawName.trim().toLowerCase();
      const existing = this.getByName(name);
      if (existing) return existing;
      const id = uuidv4();
      insertStmt.run({ id, name, created_at: new Date().toISOString() });
      const got = this.getById(id);
      if (!got) throw new Error('insert succeeded but row missing');
      return got;
    },

    rename(id: string, name: string): TagDTO | null {
      renameStmt.run(name, id);
      return this.getById(id);
    },

    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
```

- [ ] **Step 5: Create the router**

Create `server/src/routes/tags.ts`:

```ts
import { Router } from 'express';
import { ApiError } from '../middleware/errorHandler.js';
import { TagCreateSchema, TagPatchSchema } from '../../../shared/schemas.js';
import type { createTagsRepo } from '../db/tagsRepo.js';

interface Deps {
  repo: ReturnType<typeof createTagsRepo>;
}

export function tagsRouter({ repo }: Deps): Router {
  const r = Router();

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
```

- [ ] **Step 6: Wire router in `app.ts`**

Add: `import { tagsRouter } from './routes/tags.js';`
Add: `const tagsRepo = createTagsRepo(db);`
Mount: `app.use('/api/tags', tagsRouter({ repo: tagsRepo }));`

- [ ] **Step 7: Run; verify pass**

Run: `npm --workspace server test -- tags`
Expected: All PASS.

- [ ] **Step 8: Full server suite**

Run: `npm --workspace server test`
Expected: All passing.

- [ ] **Step 9: Commit**

```bash
git add shared/schemas.ts server/src/db/tagsRepo.ts server/src/routes/tags.ts server/src/app.ts server/test/tags.test.ts
git commit -m "feat(api): tags repo + routes with case-insensitive upsert"
```

---

## Task 5: Refactor documents upload — runtime `requires_financial` lookup + categoryId + tagNames

**Goal:** Replace the hard-coded `REQUIRES_FINANCIALS` set in `shared/schemas.ts` with a runtime lookup against `document_types`. Accept `categoryId` and `tagNames` on upload and persist them atomically.

**Files:**
- Modify: `shared/schemas.ts` — collapse the discriminated union into a single `DocumentCreateSchema` with all fields optional; financial-trio enforcement moves server-side.
- Modify: `server/src/db/documentsRepo.ts` — accept category + tags in insert path; expose validation helpers; extend `rowToDTO`.
- Modify: `server/src/routes/documents.ts` — call new validation flow.
- Modify: `server/test/list.test.ts` and `server/test/detail-and-download.test.ts` — update for new DTO shape (category + tags fields).

### Steps

- [ ] **Step 1: Update `shared/schemas.ts` — replace discriminated union**

Replace the union and `requiresFinancials` export with a flat schema. The server enforces `requires_financial` at runtime.

> **Client breakage window:** Removing `REQUIRES_FINANCIALS` / `requiresFinancials` from `shared/schemas.ts` will break the current `UploadPage.tsx` build, which imports those symbols. Task 12 replaces that usage with a runtime fetch. Between Task 5 and Task 12 the client workspace will not type-check. Two options:
> 1. **Land Task 5–6 server work, then immediately do Task 12 before any other client task.** Cleanest end state.
> 2. **Keep `REQUIRES_FINANCIALS` and `requiresFinancials` as deprecated re-exports through Task 5, delete them in Task 12.** Smaller blast radius per commit; safer if work pauses between tasks.
>
> Pick (2) unless you can commit to landing Task 12 in the same session as Task 5. If you pick (2), edit Task 12 Step 5 to also remove the deprecated symbols and update the commit message.

Verify the call graph first:

```bash
# From repo root
grep -rn "REQUIRES_FINANCIALS\|requiresFinancials\b" client/ server/ shared/
```

Any hit outside `shared/schemas.ts` and `shared/schemas.test.ts` must be addressed before this task commits (option 1) or kept compiling via the deprecated re-export (option 2).

```ts
// Remove (or, if option 2, mark @deprecated and re-export at bottom):
// REQUIRES_FINANCIALS, requiresFinancials, financialVariants, nonFinancialVariants,
// and the discriminatedUnion construction.

export const DocumentCreateSchema = z.object({
  documentName: z.string().min(1).max(200),
  type: DocumentTypeIdSchema,
  categoryId: z.string().uuid().nullish(),
  tagNames: z.array(TagNameSchema).max(20).optional(),
  invoiceDate: isoDate.optional(),
  amount: z.number().int().nonnegative().optional(),
  currency: z.enum(CURRENCIES).optional(),
  shortNote: z.string().max(30).optional(),
  note: z.string().max(2000).optional(),
});
export type DocumentCreate = z.infer<typeof DocumentCreateSchema>;

// Extend DTO with category + tags.
export const DocumentDTOSchema = z.object({
  id: z.string().uuid(),
  documentName: z.string(),
  type: DocumentTypeIdSchema,
  category: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  tags: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  documentDate: isoDate,
  invoiceDate: isoDate.nullable(),
  amount: z.number().int().nonnegative().nullable(),
  currency: z.enum(CURRENCIES).nullable(),
  shortNote: z.string().optional(),
  note: z.string().optional(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type DocumentDTO = z.infer<typeof DocumentDTOSchema>;
```

Also delete the existing `requiresFinancials` function — its callers (now only `documentsRepo` indirectly) move to a DB lookup.

- [ ] **Step 2: Update `shared/schemas.test.ts`**

The existing schema tests cover the discriminated union. Rewrite the relevant tests to verify:
- Flat schema accepts upload without financial fields for any type.
- Server enforcement (now in repo/route layer) is tested separately in Step 6.

Run: `npm --workspace shared test` — expect FAIL for old union-shape tests; rewrite them.

- [ ] **Step 3: Write failing tests for repo upload path**

Append to `server/test/list.test.ts` (or a new `server/test/upload.test.ts` — match existing test file organization):

```ts
describe('upload — requires_financial enforcement', () => {
  it('rejects invoice without financial trio', async () => {
    // POST /api/documents with type='invoice' and no invoiceDate/amount/currency
    // Expect 400 with error.code === 'FINANCIAL_FIELDS_REQUIRED'.
  });

  it('accepts contract without financial trio', async () => {
    // POST /api/documents with type='contract', no financial fields
    // Expect 201; DTO has invoiceDate=null, amount=null, currency=null.
  });

  it('rejects unknown or disabled type', async () => {
    // Disable type 'other' via repo.patch
    // POST /api/documents with type='other' → 400 UNKNOWN_OR_DISABLED_TYPE.
  });

  it('rejects unknown or disabled category', async () => {
    // POST with categoryId='not-a-real-uuid-of-existing-category' → 400 UNKNOWN_OR_DISABLED_CATEGORY.
  });

  it('persists tagNames as deduped lowercased tags + document_tags links', async () => {
    // POST with tagNames=['Finance', 'finance', 'HR-2026']
    // After upload: tags table has 2 rows ('finance', 'hr-2026'); document_tags has 2 links.
  });

  it('rolls back tags on document insert failure', async () => {
    // Force insert failure (e.g., duplicate id by mocking uuid)
    // After: no tags created, no document_tags rows.
  });
});
```

Flesh out each test with actual supertest calls using the same multipart form pattern as existing upload tests in the repo.

- [ ] **Step 4: Run; verify fail**

Run: `npm --workspace server test`
Expected: New tests FAIL; existing tests may also fail if they relied on the old union shape — update them.

- [ ] **Step 5: Extend `documentsRepo.ts`**

Modify `server/src/db/documentsRepo.ts`:
- Update `DocumentRow` interface to include `category_id: string | null`.
- Update `rowToDTO` to join `category` and `tags`:

```ts
function rowToDTO(r: DocumentRow, joins: { category: { id: string; name: string } | null; tags: Array<{ id: string; name: string }> }): DocumentDTO {
  return {
    id: r.id,
    documentName: r.document_name,
    type: r.type,
    category: joins.category,
    tags: joins.tags,
    documentDate: r.document_date,
    invoiceDate: r.invoice_date,
    amount: r.amount,
    currency: r.currency,
    shortNote: r.short_note ?? undefined,
    note: r.note ?? undefined,
    filename: r.filename,
    originalName: r.original_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  };
}
```

- Add `getCategoryFor(id)` and `getTagsFor(id)` helpers that the repo uses internally.
- Replace the simple `insert` with a transactional `insertWithRelations`:

```ts
insertWithRelations(dto: Omit<DocumentDTO, 'category' | 'tags'> & { categoryId: string | null }, tagIds: string[]): void {
  const txn = db.transaction(() => {
    insertStmt.run({
      id: dto.id,
      documentName: dto.documentName,
      type: dto.type,
      category_id: dto.categoryId,
      documentDate: dto.documentDate,
      invoiceDate: dto.invoiceDate,
      amount: dto.amount,
      currency: dto.currency,
      shortNote: dto.shortNote ?? null,
      note: dto.note ?? null,
      filename: dto.filename,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      createdAt: dto.createdAt,
    });
    const linkStmt = db.prepare(
      `INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?)`,
    );
    for (const tagId of tagIds) {
      linkStmt.run(dto.id, tagId);
    }
  });
  txn();
}
```

Update the prepared `INSERT` to include `category_id` and remove the old `insert` method.

> **Callsite check before renaming:** before deleting `repo.insert`, grep for all callers and update them as part of this commit (don't let a stale callsite break the build silently):
>
> ```bash
> grep -rn "documentsRepo\.insert\b\|\.insert(\s*{[^}]*documentName" server/
> ```
>
> Every hit must either move to `insertWithRelations` or be deleted. If you find a caller that wasn't on your radar, decide between (a) updating it here, or (b) keeping `insert` as a thin shim that calls `insertWithRelations` with empty `tagNames` and `categoryId: null` — but then delete the shim before this task's commit, since dead code shouldn't ship.

`getById` and `list` are updated in **Task 6**.

- [ ] **Step 6: Update route handler in `server/src/routes/documents.ts`**

Replace the existing `POST /` handler logic with type+category+tag validation, financial enforcement, and atomic insert:

```ts
import { createDocumentTypesRepo } from '../db/documentTypesRepo.js';
import { createCategoriesRepo } from '../db/categoriesRepo.js';
import { createTagsRepo } from '../db/tagsRepo.js';

interface Deps {
  repo: ReturnType<typeof createDocumentsRepo>;
  documentTypesRepo: ReturnType<typeof createDocumentTypesRepo>;
  categoriesRepo: ReturnType<typeof createCategoriesRepo>;
  tagsRepo: ReturnType<typeof createTagsRepo>;
  store: FileStore;
}

// Inside the POST handler, after parsing meta:
const type = deps.documentTypesRepo.getById(meta.type);
if (!type || type.disabledAt) {
  throw new ApiError(400, 'UNKNOWN_OR_DISABLED_TYPE', `type '${meta.type}' is not available`);
}

if (meta.categoryId) {
  const cat = deps.categoriesRepo.getById(meta.categoryId);
  if (!cat || cat.disabledAt) {
    throw new ApiError(400, 'UNKNOWN_OR_DISABLED_CATEGORY', `category not available`);
  }
}

if (type.requiresFinancial) {
  if (!meta.invoiceDate || meta.amount === undefined || !meta.currency) {
    throw new ApiError(400, 'FINANCIAL_FIELDS_REQUIRED', `type '${type.id}' requires invoice_date, amount, currency`);
  }
}

// Upsert tags before transaction (each upsert is its own statement; we accept partial duplicates
// being created if a later step in the transaction fails — they're harmless leftovers).
// Note: per spec, tags ARE created inside the upload transaction. Move the upsert inside the
// repo.insertWithRelations method by passing tagNames and resolving inside the transaction.

const tagNames = meta.tagNames ?? [];
```

Update `insertWithRelations` to resolve tag names → ids inside the transaction:

```ts
insertWithRelations(input: { dto: DocumentRowInput; categoryId: string | null; tagNames: string[] }): void {
  const txn = db.transaction(() => {
    insertStmt.run({ ...input.dto, category_id: input.categoryId });
    const upsertTagStmt = db.prepare(
      `INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (@id, @name, @created_at)`,
    );
    const selectTagStmt = db.prepare(`SELECT id FROM tags WHERE name = ?`);
    const linkStmt = db.prepare(
      `INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)`,
    );
    for (const rawName of input.tagNames) {
      const name = rawName.trim().toLowerCase();
      upsertTagStmt.run({ id: uuidv4(), name, created_at: new Date().toISOString() });
      const row = selectTagStmt.get(name) as { id: string } | undefined;
      if (row) linkStmt.run(input.dto.id, row.id);
    }
  });
  txn();
}
```

Wire deps in `app.ts`:

```ts
app.use('/api/documents', documentsRouter({
  repo: documentsRepo,
  documentTypesRepo,
  categoriesRepo,
  tagsRepo,
  store,
}));
```

- [ ] **Step 7: Run; verify pass**

Run: `npm --workspace server test`
Expected: All passing — new upload tests + existing tests that you updated for the new DTO shape.

- [ ] **Step 8: Commit**

```bash
git add shared/schemas.ts server/src/db/documentsRepo.ts server/src/routes/documents.ts server/src/app.ts server/test/
git commit -m "feat(api): runtime requires_financial + categoryId + tagNames on upload"
```

---

## Task 6: Documents list — extend filters and response with category/tags

**Files:**
- Modify: `shared/schemas.ts` — extend `ListQuerySchema` with `categoryId`, `tagId`.
- Modify: `server/src/db/documentsRepo.ts` — `getById` and `list` now join category + tags into the DTO.
- Modify: `server/test/list.test.ts` — new filter cases.

### Steps

- [ ] **Step 1: Extend `ListQuerySchema`**

```ts
export const ListQuerySchema = z.object({
  // ... existing fields
  categoryId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
});
```

- [ ] **Step 2: Failing tests for filter + response shape**

Append to `server/test/list.test.ts`:

```ts
it('filters by categoryId', async () => {
  // Seed 3 docs: 2 with categoryId='cat-a', 1 with categoryId=null.
  // GET /api/documents?categoryId=cat-a → 2 items.
});

it('filters by tagId', async () => {
  // Seed 2 docs with tag 'finance', 1 doc with tag 'hr'.
  // GET /api/documents?tagId=<finance-id> → 2 items.
});

it('list items include category and tags', async () => {
  // Seed 1 doc with category 'Finance' and 2 tags.
  // GET /api/documents → items[0].category = { id, name: 'Finance' }; items[0].tags has length 2.
});
```

- [ ] **Step 3: Run; verify fail**

Run: `npm --workspace server test -- list`
Expected: FAIL.

- [ ] **Step 4: Update `buildListSQL` and `list` in `documentsRepo.ts`**

```ts
function buildListSQL(q: ListQuery): { sql: string; countSQL: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  let fromClause = 'FROM documents d';
  let orderBy = 'ORDER BY d.document_date DESC, d.created_at DESC';

  if (q.q) {
    fromClause += ' JOIN documents_fts f ON f.rowid = d.rowid';
    where.push('f.documents_fts MATCH ?');
    params.push(`${q.q.replace(/["*]/g, '')}*`);
    orderBy = 'ORDER BY bm25(documents_fts)';
  }
  if (q.type) {
    where.push('d.type = ?');
    params.push(q.type);
  }
  if (q.categoryId) {
    where.push('d.category_id = ?');
    params.push(q.categoryId);
  }
  if (q.tagId) {
    fromClause += ' JOIN document_tags dt ON dt.document_id = d.id';
    where.push('dt.tag_id = ?');
    params.push(q.tagId);
  }
  if (q.invoiceDateFrom) { where.push('d.invoice_date >= ?'); params.push(q.invoiceDateFrom); }
  if (q.invoiceDateTo)   { where.push('d.invoice_date <= ?'); params.push(q.invoiceDateTo); }
  if (q.uploadDateFrom)  { where.push('d.document_date >= ?'); params.push(q.uploadDateFrom); }
  if (q.uploadDateTo)    { where.push('d.document_date <= ?'); params.push(q.uploadDateTo); }
  if (q.shortNote)       { where.push("d.short_note LIKE ? ESCAPE '\\'"); params.push(shortNoteToLike(q.shortNote)); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql      = `SELECT d.* ${fromClause} ${whereClause} ${orderBy} LIMIT ? OFFSET ?`;
  const countSQL = `SELECT COUNT(DISTINCT d.id) AS c ${fromClause} ${whereClause}`;
  return { sql, countSQL, params };
}
```

Update `list`/`getById` to fetch and attach `category` + `tags`. Add a single batched query for tags-per-document to avoid N+1:

```ts
function attachJoins(rows: DocumentRow[]): DocumentDTO[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');

  const tagRows = db
    .prepare(
      `SELECT dt.document_id, t.id, t.name
       FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
       WHERE dt.document_id IN (${placeholders})`,
    )
    .all(...ids) as Array<{ document_id: string; id: string; name: string }>;

  const tagsByDoc = new Map<string, Array<{ id: string; name: string }>>();
  for (const tr of tagRows) {
    const arr = tagsByDoc.get(tr.document_id) ?? [];
    arr.push({ id: tr.id, name: tr.name });
    tagsByDoc.set(tr.document_id, arr);
  }

  const categoryIds = rows
    .map((r) => r.category_id)
    .filter((x): x is string => x !== null);
  // SQLite parses `IN ()` as a syntax error — skip the query if no doc has a category.
  const catRows =
    categoryIds.length === 0
      ? []
      : (db
          .prepare(
            `SELECT id, name FROM categories WHERE id IN (${categoryIds.map(() => '?').join(',')})`,
          )
          .all(...categoryIds) as Array<{ id: string; name: string }>);
  const catById = new Map(catRows.map((c) => [c.id, c]));

  return rows.map((r) =>
    rowToDTO(r, {
      category: r.category_id ? catById.get(r.category_id) ?? null : null,
      tags: tagsByDoc.get(r.id) ?? [],
    }),
  );
}
```

`getById` becomes a single-row call to `attachJoins`.

- [ ] **Step 5: Run; verify pass**

Run: `npm --workspace server test -- list`
Expected: All PASS.

- [ ] **Step 6: Full server suite**

Run: `npm --workspace server test`
Expected: All passing.

- [ ] **Step 7: Commit**

```bash
git add shared/schemas.ts server/src/db/documentsRepo.ts server/test/list.test.ts
git commit -m "feat(api): list filters by categoryId/tagId + response carries category+tags"
```

---

## Task 7: Client API extensions for tags/categories/document-types

**Files:**
- Modify: `client/src/api.ts` — add `tagsApi`, `categoriesApi`, `documentTypesApi`.
- Modify: `client/src/api.test.ts` — extend with new endpoints.

### Steps

- [ ] **Step 1: Write failing test**

Append to `client/src/api.test.ts`:

```ts
describe('tagsApi', () => {
  it('GET /api/tags returns items', async () => {
    // Mock fetch with msw or your existing pattern.
    // Verify api.tags.list() returns the parsed list.
  });

  it('GET /api/tags?q=fin URL-encodes the query', async () => { /* ... */ });

  it('POST /api/tags creates', async () => { /* ... */ });

  it('PATCH /api/tags/:id renames', async () => { /* ... */ });

  it('DELETE /api/tags/:id deletes', async () => { /* ... */ });
});
// Mirror the same shape for categoriesApi and documentTypesApi.
```

- [ ] **Step 2: Run; verify fail**

Run: `npm --workspace client test -- api`
Expected: FAIL.

- [ ] **Step 3: Extend `client/src/api.ts`**

Add three sub-API namespaces following the existing module convention. Read `client/src/api.ts` first to match its patterns (error handling, JSON parsing, query string assembly):

```ts
// tagsApi
export const tagsApi = {
  list(q?: string): Promise<{ items: TagDTO[] }> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return fetchJSON(`/api/tags${qs}`);
  },
  create(name: string): Promise<TagDTO> {
    return fetchJSON('/api/tags', { method: 'POST', body: JSON.stringify({ name }) });
  },
  rename(id: string, name: string): Promise<TagDTO> {
    return fetchJSON(`/api/tags/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  },
  remove(id: string): Promise<void> {
    return fetchJSON(`/api/tags/${id}`, { method: 'DELETE' });
  },
};

// categoriesApi — list/create/patch/remove
// documentTypesApi — list/create/patch (no remove)
```

Reuse the existing `fetchJSON` helper (or whatever the file already has) — don't introduce a new one.

- [ ] **Step 4: Run; verify pass**

Run: `npm --workspace client test -- api`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/api.ts client/src/api.test.ts
git commit -m "feat(client): api bindings for tags, categories, document_types"
```

---

## Task 8: Settings page scaffolding + ShellBar entry

**Files:**
- Create: `client/src/pages/SettingsPage.tsx`
- Modify: `client/src/App.tsx` — add `/settings` route.
- Modify: `client/src/components/ShellBar.tsx` — add Settings link.
- Modify: `client/src/components/ShellBar.test.tsx` — verify Settings link exists.

### Steps

- [ ] **Step 1: Failing test**

Add to `client/src/components/ShellBar.test.tsx`:

```ts
it('renders a Settings link to /settings', () => {
  render(<MemoryRouter><ShellBar /></MemoryRouter>);
  const link = screen.getByRole('link', { name: /settings/i });
  expect(link).toHaveAttribute('href', '/settings');
});
```

- [ ] **Step 2: Run; verify fail**

Run: `npm --workspace client test -- ShellBar`
Expected: FAIL.

- [ ] **Step 3: Add the link**

Modify `ShellBar.tsx` — append a `<NavLink>` for Settings alongside the existing Browse/Upload entries. Match the existing visual treatment.

- [ ] **Step 4: Create `SettingsPage.tsx`**

```tsx
import { useState } from 'react';

type Tab = 'tags' | 'categories' | 'document-types';

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('document-types');
  return (
    <div className="settings-page">
      <header>
        <h1>Settings <span className="settings-page__hint">(Admin)</span></h1>
      </header>
      <nav className="settings-page__tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'document-types'} onClick={() => setTab('document-types')}>Document Types</button>
        <button role="tab" aria-selected={tab === 'categories'}     onClick={() => setTab('categories')}>Categories</button>
        <button role="tab" aria-selected={tab === 'tags'}           onClick={() => setTab('tags')}>Tags</button>
      </nav>
      <section role="tabpanel" className="settings-page__panel">
        {tab === 'document-types' && <DocumentTypesTab />}
        {tab === 'categories'     && <CategoriesTab />}
        {tab === 'tags'           && <TagsTab />}
      </section>
    </div>
  );
}

// Stub the three tab components for now — they're filled in by Tasks 9, 10, 11.
function DocumentTypesTab() { return <p>document-types tab</p>; }
function CategoriesTab()    { return <p>categories tab</p>; }
function TagsTab()          { return <p>tags tab</p>; }
```

- [ ] **Step 5: Wire the route in `App.tsx`**

Add: `<Route path="/settings" element={<SettingsPage />} />` alongside existing Browse/Upload/Detail routes.

- [ ] **Step 6: Run; verify pass**

Run: `npm --workspace client test`
Expected: All passing.

- [ ] **Step 7: Manual smoke check**

Run: `npm --workspace client dev` and visit `http://localhost:5173/settings`. Confirm the three-tab UI renders and tab switching works.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/SettingsPage.tsx client/src/App.tsx client/src/components/ShellBar.tsx client/src/components/ShellBar.test.tsx
git commit -m "feat(client): /settings page with three-tab scaffolding and ShellBar entry"
```

---

## Task 9: Document Types admin tab

**Files:**
- Create: `client/src/pages/settings/DocumentTypesTab.tsx`
- Create: `client/src/pages/settings/DocumentTypesTab.test.tsx`
- Modify: `client/src/pages/SettingsPage.tsx` — import real tab, remove stub.

### Steps

- [ ] **Step 1: Failing tests**

Create `DocumentTypesTab.test.tsx` covering:
- Renders rows from `documentTypesApi.list({ includeDisabled: true })`.
- "+ New" button opens a form with editable `requires_financial` checkbox.
- Existing rows show `requires_financial` as a read-only checkbox with a `title` of "Set at creation".
- Rename: edits label, calls `documentTypesApi.patch(id, { label })`, re-renders.
- Disable toggle: calls `patch(id, { disabledAt: ... | null })`.
- Submitting `+ New` with a duplicate id surfaces `NAME_TAKEN` error.

- [ ] **Step 2: Implementation**

Create `DocumentTypesTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { documentTypesApi } from '../../api';
import type { DocumentTypeDTO } from '../../../../shared/schemas';

export function DocumentTypesTab() {
  const [items, setItems] = useState<DocumentTypeDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function reload() {
    setItems((await documentTypesApi.list({ includeDisabled: true })).items);
  }
  useEffect(() => { reload().catch((e) => setError(String(e))); }, []);

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr><th>ID</th><th>Label</th><th>Requires Financial</th><th>Sort</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {items.map((t) => <TypeRow key={t.id} item={t} onChange={reload} onError={setError} />)}
        </tbody>
      </table>
      <button onClick={() => setCreating(true)}>+ New</button>
      {creating && <NewTypeForm onDone={() => { setCreating(false); reload(); }} onError={setError} />}
    </div>
  );
}
// TypeRow: inline-editable label, read-only requires_financial checkbox with title="Set at creation",
// disabled toggle button. Pattern: edit/save buttons; optimistic UI; surfaces error.code into setError.
// NewTypeForm: id (snake_case), label, requiresFinancial (editable), sortOrder. Submit → POST. On 409 NAME_TAKEN show inline.
```

Implement both subcomponents inline. Keep the file small enough — split into a `_row.tsx` file if it grows past ~250 lines.

- [ ] **Step 3: Update `SettingsPage.tsx`**

Replace `function DocumentTypesTab() { return <p>document-types tab</p>; }` with:
```tsx
import { DocumentTypesTab } from './settings/DocumentTypesTab';
```

- [ ] **Step 4: Run; verify pass**

Run: `npm --workspace client test -- DocumentTypesTab`
Expected: All PASS.

- [ ] **Step 5: Manual smoke check**

Dev server. Visit `/settings`. Confirm types appear, "+ New" works, rename works, disable works, `requires_financial` is locked on existing rows.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/settings/ client/src/pages/SettingsPage.tsx
git commit -m "feat(client): Document Types settings tab with immutable requires_financial"
```

---

## Task 10: Categories admin tab

**Files:**
- Create: `client/src/pages/settings/CategoriesTab.tsx`
- Create: `client/src/pages/settings/CategoriesTab.test.tsx`
- Modify: `client/src/pages/SettingsPage.tsx` — wire real tab.

### Steps

- [ ] **Step 1: Failing tests**

Tests parallel Task 9:
- Renders categories from `categoriesApi.list({ includeDisabled: true })`.
- "+ New" creates.
- Rename updates name.
- Disable toggle works.
- Delete works.
- 409 `NAME_TAKEN` surfaced inline.

- [ ] **Step 2: Implementation**

Create `CategoriesTab.tsx`. Same structure as DocumentTypesTab but:
- No `requires_financial` column.
- Has Delete button (calls `categoriesApi.remove(id)`); confirm modal.
- Sort order editable inline (number input).

- [ ] **Step 3: Wire in SettingsPage**

Replace the stub.

- [ ] **Step 4: Run; verify pass**

Run: `npm --workspace client test -- CategoriesTab`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/settings/CategoriesTab.tsx client/src/pages/settings/CategoriesTab.test.tsx client/src/pages/SettingsPage.tsx
git commit -m "feat(client): Categories settings tab"
```

---

## Task 11: Tags admin tab

**Files:**
- Create: `client/src/pages/settings/TagsTab.tsx`
- Create: `client/src/pages/settings/TagsTab.test.tsx`
- Modify: `client/src/pages/SettingsPage.tsx`

### Steps

- [ ] **Step 1: Failing tests**

Cover:
- Renders tags from `tagsApi.list()`.
- Shows usage count (from a new server endpoint OR via a `GET /api/tags` that returns counts — see Step 2 below).
- Rename calls `tagsApi.rename`.
- Delete calls `tagsApi.remove`.

- [ ] **Step 2: Add usage-count to `tagsApi.list`**

Server-side: extend `GET /api/tags` to optionally return `usageCount`:

```ts
// In tagsRepo.list (server):
const listWithCountStmt = db.prepare(`
  SELECT t.*, COUNT(dt.tag_id) AS usage_count
  FROM tags t LEFT JOIN document_tags dt ON dt.tag_id = t.id
  GROUP BY t.id ORDER BY t.name
`);
```

Return `{ items: [{ ...tag, usageCount }] }`. Update `TagDTOSchema` to include `usageCount: z.number().int().nonnegative().optional()` — leave a `// populated only by the list endpoint; not present on POST/PATCH responses` comment so future maintainers don't expect it on the create/rename paths.

Add a server route test for the usage count.

- [ ] **Step 3: Implementation**

Create `TagsTab.tsx`. Simpler than the other two tabs — fewer fields.

- [ ] **Step 4: Wire in SettingsPage**

- [ ] **Step 5: Run; verify pass**

Run: `npm --workspace client test -- TagsTab` and `npm --workspace server test -- tags`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/settings/TagsTab.tsx client/src/pages/settings/TagsTab.test.tsx client/src/pages/SettingsPage.tsx server/src/db/tagsRepo.ts server/test/tags.test.ts shared/schemas.ts
git commit -m "feat: Tags settings tab with usage counts"
```

---

## Task 12: Upload form — category dropdown, dynamic financial trio, tag chip input

**Files:**
- Modify: `client/src/pages/UploadPage.tsx`
- Create: `client/src/components/TagChipInput.tsx`
- Create: `client/src/components/TagChipInput.test.tsx`
- Modify: `client/src/pages/UploadPage.test.tsx` (or whichever file currently exercises upload — find it via `Glob`)

### Steps

- [ ] **Step 1: Failing tests for TagChipInput**

Create `TagChipInput.test.tsx`:
- Renders with empty value.
- Typing 3 characters triggers a debounced fetch to `/api/tags?q=...`.
- Pressing Enter on a suggestion adds it as a chip.
- Pressing Enter on a free-typed value (no matching suggestion) adds it as a new chip.
- Backspace on empty input removes the last chip.
- × on a chip removes it.
- `onChange` fires with the current chip array.
- Suggestion fetch rejecting (network error) leaves the input usable — no crash, no thrown error, suggestions list collapses to empty.

- [ ] **Step 2: Implement `TagChipInput.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { tagsApi } from '../api';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function TagChipInput({ value, onChange }: Props) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (input.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { items } = await tagsApi.list(input);
        setSuggestions(items.map((t) => t.name).filter((n) => !value.includes(n)));
      } catch {
        // Network/server errors shouldn't break the input — user can still type a fresh tag.
        setSuggestions([]);
      }
    }, 200);
  }, [input, value]);

  function addChip(name: string) {
    const normalized = name.trim().toLowerCase();
    if (!normalized || value.includes(normalized)) return;
    onChange([...value, normalized]);
    setInput('');
    setSuggestions([]);
  }

  function removeChip(name: string) {
    onChange(value.filter((n) => n !== name));
  }

  return (
    <div className="tag-chip-input">
      {value.map((name) => (
        <span key={name} className="tag-chip">
          {name}
          <button type="button" aria-label={`Remove ${name}`} onClick={() => removeChip(name)}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && input.length > 0) {
            e.preventDefault();
            addChip(suggestions[0] ?? input);
          } else if (e.key === 'Backspace' && input.length === 0 && value.length > 0) {
            removeChip(value[value.length - 1]!);
          }
        }}
        placeholder="Add tag…"
      />
      {suggestions.length > 0 && (
        <ul role="listbox" className="tag-chip-input__suggestions">
          {suggestions.map((s) => (
            <li key={s} role="option">
              <button type="button" onClick={() => addChip(s)}>{s}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run TagChipInput tests; verify pass**

Run: `npm --workspace client test -- TagChipInput`
Expected: All PASS.

- [ ] **Step 4: Failing tests for UploadPage integration**

Update upload tests to assert:
- Type dropdown is populated from `documentTypesApi.list()` (mock that call).
- When type with `requiresFinancial: true` is selected, financial trio fields appear.
- When type with `requiresFinancial: false` is selected, financial trio is hidden.
- Category dropdown is populated from `categoriesApi.list()`.
- TagChipInput is present.
- Submit POSTs `metadata` JSON containing `type`, `categoryId`, `tagNames`.

- [ ] **Step 5: Update `UploadPage.tsx`**

Replace the static `DOCUMENT_TYPES` import with a runtime fetch from `documentTypesApi.list()`. Track the selected type DTO so `requiresFinancial` can drive conditional rendering of the trio. Add a category `<select>` (placeholder "— None —"). Mount `<TagChipInput />`. In the submit handler, include `categoryId` (or null) and `tagNames` in the `metadata` JSON sent to `/api/documents`.

Show the actual edits — read `UploadPage.tsx` first if uncertain about the existing form structure.

- [ ] **Step 6: Run upload tests; verify pass**

Run: `npm --workspace client test -- Upload`
Expected: All PASS.

- [ ] **Step 7: Manual smoke check**

Dev servers (server + client). Upload an invoice with tags + category. Upload a contract with no financial fields. Confirm both succeed and appear correctly in the browse list (already wired in Task 6's server changes; browse UI follows in Task 13).

- [ ] **Step 8: Commit**

```bash
git add client/src/components/TagChipInput.tsx client/src/components/TagChipInput.test.tsx client/src/pages/UploadPage.tsx client/src/pages/UploadPage.test.tsx
git commit -m "feat(client): upload form — dynamic financial trio + category + tag chips"
```

---

## Task 13: Browse page — category filter + tag filter + row badges

**Files:**
- Modify: `client/src/pages/BrowsePage.tsx`
- Modify: `client/src/components/FilterDrawer.tsx`
- Modify: corresponding test files.

### Steps

- [ ] **Step 1: Failing tests**

Add to the existing browse/filter test files:
- FilterDrawer renders a Category dropdown and a single-Tag selector.
- Apply applies category/tag filter to the list query.
- Reset clears them along with existing fields.
- Each row in BrowsePage renders a category badge (if present) and up to 3 tag chips with "+N" overflow.

- [ ] **Step 2: Implementation**

Update `FilterDrawer.tsx`:
- Add `categoryId?: string` and `tagId?: string` to the draft/applied filter shape.
- Add a `<select>` for category (populated from `categoriesApi.list()`).
- Add a single-tag selector — reuse `TagChipInput` but constrained to a single chip (cap at 1, no autocomplete on add).
- Pass the new values through Apply/Reset.

Update `BrowsePage.tsx`:
- Pass `categoryId` and `tagId` into the list query params.
- In each row, render a category badge after the type chip if `item.category` is non-null.
- Render up to 3 of `item.tags` as small chips, with "+N more" if `item.tags.length > 3`.

- [ ] **Step 3: Run tests; verify pass**

Run: `npm --workspace client test -- Browse FilterDrawer`
Expected: All PASS.

- [ ] **Step 4: Manual smoke check**

Browse with category filter. Browse with tag filter. Verify list rows display badges.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/BrowsePage.tsx client/src/components/FilterDrawer.tsx client/src/pages/BrowsePage.test.tsx client/src/components/FilterDrawer.test.tsx
git commit -m "feat(client): browse filters by category/tag + row badges"
```

---

## Task 14: Inline preview for PDF and image documents

**Goal:** Render PDFs and images inline on the document detail page so users don't have to download to look at a file. Other MIME types keep the existing download-only flow.

**Depends on:** Tasks 5/6 — the test fixture in Step 7 assumes the post-Task-6 `DocumentDTO` shape (carries `category` and `tags`).

**Files:**
- Modify: `server/src/routes/documents.ts` — accept `?inline=1` on the file-serving route and switch `Content-Disposition` accordingly.
- Modify: `server/test/detail-and-download.test.ts` — tighten existing assertion + add inline-mode tests.
- Modify: `client/src/api.ts` — extend `fileUrl` with an `{ inline }` option.
- Create: `client/src/components/DocumentPreview.tsx`
- Create: `client/src/components/DocumentPreview.test.tsx`
- Create: `client/src/components/document-preview.css`
- Modify: `client/src/pages/DocumentDetailPage.tsx` — mount `<DocumentPreview>` near the top of the card.

### Steps

- [ ] **Step 1: Confirm shape of the file route**

Read `server/src/routes/documents.ts:107-125`. Confirm:
- Path is `GET /api/documents/:id/file`.
- `Content-Disposition` is set on line 119 with `attachment; filename="..."`.
- Filename is escaped via `dto.originalName.replace(/"/g, '')`.

The new code MUST preserve that escape pattern in both branches — do not introduce a new encoding scheme.

- [ ] **Step 2: Tighten existing test + add failing tests for inline mode**

Modify `server/test/detail-and-download.test.ts`:

**(a)** Inside `it('streams file with Content-Disposition', ...)` (line 45), tighten line 50:
```ts
expect(res.headers['content-disposition']).toMatch(/^attachment;/);
expect(res.headers['content-disposition']).toMatch(/orig\.pdf/);
```

**(b)** Append two new tests **inside the existing `describe` block** so they share `beforeEach`/`afterEach` and have access to `uploadAndGetId()` / `env`:
```ts
it('serves Content-Disposition: inline when ?inline=1', async () => {
  const id = await uploadAndGetId();
  const res = await request(env.app).get(`/api/documents/${id}/file?inline=1`);
  expect(res.status).toBe(200);
  expect(res.headers['content-disposition']).toMatch(/^inline;/);
  expect(res.headers['content-type']).toMatch(/^application\/pdf/);
});

it('defaults to Content-Disposition: attachment without ?inline=1', async () => {
  const id = await uploadAndGetId();
  const res = await request(env.app).get(`/api/documents/${id}/file`);
  expect(res.headers['content-disposition']).toMatch(/^attachment;/);
});
```

- [ ] **Step 3: Run; verify fail**

Run: `npm --workspace server test -- detail-and-download`
Expected: FAIL — the inline test sees `attachment;`.

- [ ] **Step 4: Implement inline support**

In `server/src/routes/documents.ts` at lines 117–120, replace the static disposition with a query-flag branch (keep the existing `.replace(/"/g, '')` escape — do not switch to `encodeURIComponent`):
```ts
const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
res.setHeader(
  'Content-Disposition',
  `${disposition}; filename="${dto.originalName.replace(/"/g, '')}"`,
);
```

Same auth, same streaming, same error paths.

- [ ] **Step 5: Run; verify pass**

Run: `npm --workspace server test -- detail-and-download`
Expected: All 5 assertions in this file pass; existing tests still green.

- [ ] **Step 6: Extend `api.fileUrl`**

In `client/src/api.ts:80-82`, extend the helper to support an optional `inline` flag (the default keeps existing call sites unchanged):
```ts
fileUrl(id: string, opts: { inline?: boolean } = {}): string {
  return `/api/documents/${id}/file${opts.inline ? '?inline=1' : ''}`;
},
```

The existing call at `DocumentDetailPage.tsx:104` (`api.fileUrl(dto.id)`) keeps the same default — no edit needed there.

- [ ] **Step 7: Failing tests for DocumentPreview**

Create `client/src/components/DocumentPreview.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { DocumentPreview } from './DocumentPreview';
import type { DocumentDTO } from '../types.js';

// Assumes post-Task-6 DTO shape (category + tags fields present).
const baseDoc: DocumentDTO = {
  id: 'doc-1',
  documentName: 'Sample',
  type: 'invoice',
  documentDate: '2026-05-21',
  invoiceDate: null,
  amount: null,
  currency: null,
  filename: 'sample.pdf',
  originalName: 'sample.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: '2026-05-21T00:00:00.000Z',
  category: null,
  tags: [],
};

it('renders an <img> for image MIME types pointing at the inline endpoint', () => {
  render(<DocumentPreview doc={{ ...baseDoc, mimeType: 'image/png', originalName: 'pic.png' }} />);
  const img = screen.getByRole('img');
  expect(img).toHaveAttribute('src', '/api/documents/doc-1/file?inline=1');
  expect(img).toHaveAttribute('alt', 'pic.png');
});

it('renders an <iframe> for application/pdf pointing at the inline endpoint', () => {
  render(<DocumentPreview doc={baseDoc} />);
  const frame = screen.getByTitle('sample.pdf');
  expect(frame).toHaveAttribute('src', '/api/documents/doc-1/file?inline=1');
});

it('renders nothing for unsupported MIME types (existing Download button handles it)', () => {
  const { container } = render(
    <DocumentPreview
      doc={{
        ...baseDoc,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalName: 'memo.docx',
      }}
    />,
  );
  expect(container.firstChild).toBeNull();
});

it('does NOT inline image/svg+xml (script-execution risk) — renders nothing', () => {
  const { container } = render(
    <DocumentPreview doc={{ ...baseDoc, mimeType: 'image/svg+xml', originalName: 'icon.svg' }} />,
  );
  expect(container.firstChild).toBeNull();
});

it('falls back to a default iframe title when originalName is empty', () => {
  render(<DocumentPreview doc={{ ...baseDoc, originalName: '' }} />);
  expect(screen.getByTitle('PDF preview')).toBeInTheDocument();
});
```

- [ ] **Step 8: Run; verify fail**

Run: `npm --workspace client test -- DocumentPreview`
Expected: FAIL — module missing.

- [ ] **Step 9: Implement DocumentPreview**

Create `client/src/components/document-preview.css`:
```css
.document-preview--image img {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
  display: block;
}
.document-preview--pdf iframe {
  width: 100%;
  height: 80vh;
  border: 0;
}
```

Create `client/src/components/DocumentPreview.tsx`:
```tsx
import { api } from '../api.js';
import type { DocumentDTO } from '../types.js';
import './document-preview.css';

// Intentionally narrow allow-list. image/svg+xml is excluded because SVG can carry <script>
// and inline rendering would execute it under the app's origin.
const PREVIEWABLE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

interface Props {
  doc: DocumentDTO;
}

export function DocumentPreview({ doc }: Props) {
  const inlineSrc = api.fileUrl(doc.id, { inline: true });

  if (PREVIEWABLE_IMAGE_TYPES.has(doc.mimeType)) {
    return (
      <div className="document-preview document-preview--image">
        <img src={inlineSrc} alt={doc.originalName} />
      </div>
    );
  }

  if (doc.mimeType === 'application/pdf') {
    return (
      <div className="document-preview document-preview--pdf">
        <iframe src={inlineSrc} title={doc.originalName || 'PDF preview'} />
      </div>
    );
  }

  // Non-previewable: the existing Download button on the detail page handles it.
  return null;
}
```

> **Layout note:** the detail page card has `maxWidth: 720`. Both the image and the PDF iframe inherit that cap. If a wider preview is desired later, move the preview outside the 720-wide card.

- [ ] **Step 10: Wire into the detail page**

In `client/src/pages/DocumentDetailPage.tsx`:

(a) Add the import near the existing ones:
```ts
import { DocumentPreview } from '../components/DocumentPreview.js';
```

(b) Inside the card, immediately after the `<h2>` (line 72) and before the `<dl>`, mount:
```tsx
<DocumentPreview doc={dto} />
```

The component returns `null` for non-previewable types, so the layout is unchanged for `.docx` etc. The existing Download button at line 104 stays — it's the canonical way to fetch the original file.

- [ ] **Step 11: Run client tests; verify pass**

Run: `npm --workspace client test -- DocumentPreview`
Expected: 5 PASS. Then `npm --workspace client test` to confirm no other client tests regress.

- [ ] **Step 12: Manual smoke check**

Dev servers up. Upload three test files: a PNG, a PDF, and a non-previewable type (e.g., `.docx`). Open each detail page:
- Image: renders inline, fits within the 720-wide card, no scroll bars on the image itself.
- PDF: browser's native PDF viewer appears in the iframe; scroll/zoom works.
- Non-previewable: no preview block; existing `Download original` link still works.

Also verify the **existing** `Download original` link still triggers a download (Content-Disposition: attachment) — inline is opt-in via the query flag.

- [ ] **Step 13: Commit**

```bash
git add server/src/routes/documents.ts server/test/detail-and-download.test.ts client/src/api.ts client/src/components/DocumentPreview.tsx client/src/components/DocumentPreview.test.tsx client/src/components/document-preview.css client/src/pages/DocumentDetailPage.tsx
git commit -m "feat: inline preview for PDF and image documents on detail page"
```

---

## Task 15: Playwright E2E coverage

**Files:**
- Modify or create: `e2e/phase2.spec.ts` (or extend an existing spec file)

### Steps

- [ ] **Step 1: Identify the existing E2E structure**

Run: `Glob('e2e/**/*.spec.ts')` (or whichever directory holds the existing Playwright specs). Read one to understand the helper/fixture patterns.

- [ ] **Step 2: Write the E2E spec**

Create `e2e/phase2.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Phase 2 — tags, categories, document types', () => {
  test('admin creates a category and a tag, uploads with both, sees on browse', async ({ page }) => {
    // 1. Go to /settings → Categories tab → "+ New" → enter "Finance" → save
    // 2. Tags tab → "+ New" → enter "Q2-2026" → save
    // 3. Go to /upload → fill form: type=Invoice, document_name, financial trio, category=Finance, tag=Q2-2026
    // 4. Submit
    // 5. Go to /browse → see new row with category badge "Finance" and tag chip "q2-2026"
  });

  test('admin disables a category, it disappears from upload but stays on existing docs', async ({ page }) => {
    // 1. Pre-seed via API or repeat the create flow.
    // 2. Disable category.
    // 3. Upload form's category dropdown no longer offers it.
    // 4. Browse list still shows the badge on the prior document.
  });

  test('admin creates a document type with requires_financial=true; UI behaves accordingly', async ({ page }) => {
    // 1. Settings → Document Types → "+ New" → id=tax_form, label="Tax Form", requires_financial=checked → save
    // 2. /upload → choose Tax Form → financial trio appears
    // 3. PATCH attempt via UI to flip requires_financial → input is read-only with locked-icon
  });

  test('search finds documents by tag name', async ({ page }) => {
    // Upload a doc tagged "compliance-2026".
    // Use the search input on /browse with q="compliance" → row appears.
  });
});
```

- [ ] **Step 3: Run E2E**

Run: `npm run e2e` (or whatever the workspace script is; check `package.json`)
Expected: All four scenarios pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/phase2.spec.ts
git commit -m "test(e2e): Phase 2 admin + upload + browse flows"
```

---

## Task 16: Docs update — README + admin guidance

**Files:**
- Modify: `README.md`
- Modify (optional): `docs/superpowers/specs/2026-05-19-inhouse-dms-phase2-design.md` — append a "Shipped in commit range X..Y" footer

### Steps

- [ ] **Step 1: Find the README section that lists features**

Read `README.md` to locate the feature list (or the section that introduces the app). The change is small — one short paragraph or three bullets:
- Document types are now configurable in `/settings` (admin-only).
- Categories and tags can be attached to documents and used as filters.
- The "Requires financial fields" flag is set when a type is created and cannot be changed afterwards.

- [ ] **Step 2: Add a one-line note about the admin entry**

Mention `/settings` as the admin entry point in whichever section currently documents navigation. Don't invent screenshots — text only.

- [ ] **Step 3: Append the spec footer (optional)**

At the bottom of `docs/superpowers/specs/2026-05-19-inhouse-dms-phase2-design.md`, append:

```markdown
---

## Implementation status

Shipped via commits `<first-task-1-sha>..<last-task-16-sha>` on `main`.
```

Fill in the SHAs at the very end of execution, right before the final push.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-05-19-inhouse-dms-phase2-design.md
git commit -m "docs: Phase 2 admin entry point + spec implementation footer"
```

---

## Final verification

- [ ] **All workspace tests green**

Run: `npm test` (from repo root) — runs server, client, shared, and e2e suites.
Expected: All passing.

- [ ] **Manual smoke pass**

Dev servers up. Walk through every user-visible feature listed in the spec:
- Admin manages all three resource types in `/settings`.
- Upload with new fields works for both financial and non-financial types.
- Browse filters and badges work.
- Search finds by tag/category.

- [ ] **Push the branch**

Confirm the spec commit + 16 feature/docs commits are clean and linear, then push.

```bash
git push -u origin main
```
