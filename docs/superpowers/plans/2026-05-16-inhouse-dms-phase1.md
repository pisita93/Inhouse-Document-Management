# Inhouse DMS Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the receipt-upload app to "Inhouse DMS", expand the document type taxonomy from 4 → 10, make financial fields (invoice date / amount / currency) conditionally required, split the date semantics into a server-set `document_date` and a user-entered `invoice_date`, and replace the ad-hoc UI with a Fiori-inspired responsive shell — without breaking the existing test suite.

**Architecture:** Single-process Express + SQLite (better-sqlite3) backend with a React + Vite SPA. Domain rename happens at every layer (DB table, repo, route, client API, components). Conditional financial-field rules live in a `zod.discriminatedUnion` shared between client and server. File-store paths derive from `createdAt` upload time, decoupling on-disk layout from optional metadata. Visual system is plain CSS + design tokens — no UI framework.

**Tech Stack:** TypeScript, Express, better-sqlite3, zod, React 18, React Router, Vite, Vitest, supertest, Playwright. SQLite FTS5 for search.

**Branching:** Spec rename is invasive — do the work on a feature branch (`feat/inhouse-dms-phase1` or worktree). Cumulative GREEN at end of plan; intermediate tasks may leave server tests RED until the rename completes through Task 6.

---

## File map

**New files**

| Path | Responsibility |
|---|---|
| `migrations/002_rename_to_documents.sql` | Idempotent migration: creates `documents`, indexes, FTS, triggers; backfills from `receipts`; drops legacy tables. |
| `server/src/db/documentsRepo.ts` | Replaces `receiptsRepo.ts`. CRUD + list with dual date filters. |
| `server/src/routes/documents.ts` | Replaces `routes/receipts.ts`. Server-sets `document_date` at insert. |
| `client/src/styles/tokens.css` | CSS custom properties for the Fiori palette + chip styles + base resets. |
| `client/src/components/ShellBar.tsx` | Top dark bar with app title + search + avatar. |
| `client/src/components/SubBar.tsx` | White breadcrumb/actions bar between ShellBar and content. |
| `client/src/components/TypeChip.tsx` | Renders a single document-type chip with the color mapping. |
| `client/src/components/FilterDrawer.tsx` | Mobile (<768px) slide-out wrapper around the BrowsePage filter panel. |
| `client/src/pages/DocumentDetailPage.tsx` | Replaces `ReceiptDetailPage.tsx`. Conditional financial rows. |
| `e2e/golden-path-contract.spec.ts` | Non-financial flow: upload contract → financial fields never render → detail page omits financial rows. |

**Modified files**

| Path | Change |
|---|---|
| `shared/schemas.ts` | Full rewrite to Document* types, discriminated union, `REQUIRES_FINANCIALS`, `requiresFinancials`, dual-date `ListQuerySchema`. |
| `shared/schemas.test.ts` | Re-write to cover the new schema shape. |
| `server/src/app.ts` | Mount path `/api/receipts` → `/api/documents`; import names. |
| `server/src/index.ts` | Symbol rename only. |
| `server/src/storage/fileStore.ts` | Rename `invoiceDate` parameter to `createdAt` across all five functions. |
| `server/test/helpers.ts` | Use `createDocumentsRepo`; same fixtures. |
| `server/test/*.test.ts` | Route + field renames; new dual-date assertions; FTS idempotency test. |
| `client/src/main.tsx` | Import `./styles/tokens.css`. |
| `client/src/App.tsx` | Wrap routes in ShellBar + SubBar; update route paths to `/documents/:id`. |
| `client/src/api.ts` | Endpoints → `/api/documents`; DTO types; dual date params. |
| `client/src/types.ts` | Unchanged (re-export of `@shared/schemas`). |
| `client/src/pages/UploadPage.tsx` | Conditional fields, new shell styling, financial-state persistence on type switch. |
| `client/src/pages/BrowsePage.tsx` | Dual date filters, type chips, table columns, mobile FilterDrawer integration. |
| `client/src/api.test.ts` | URL updates. |
| `e2e/*.spec.ts` | Label updates (`Invoice Date` still appears for financials; new `Document Date` shown read-only). |
| `README.md` | Rebrand text. |
| `package.json` | `description` → "Inhouse DMS". |

**Removed files**

- `server/src/routes/receipts.ts`
- `server/src/db/receiptsRepo.ts`
- `server/test/receiptsRepo.test.ts` (renamed to `documentsRepo.test.ts`)
- `client/src/pages/ReceiptDetailPage.tsx`

---

## Task ordering

1. Migration 002 + migrations test (DB rename, idempotency)
2. Shared schemas rewrite + schemas test (Document types, discriminated union, requiresFinancials)
3. FileStore signature change (`invoiceDate` → `createdAt`) + fileStore test
4. `documentsRepo` (rename, dual date filters, nullable financials) + repo test
5. `/api/documents` route + supertest specs (upload, list, detail, delete, FTS, validation)
6. App wiring + test helpers + server index (mount path; symbol rename) — server suite back to GREEN
7. Client `api.ts` + `api.test.ts` (URLs, DTO, query params)
8. Visual system: `tokens.css` + `ShellBar` + `SubBar` + `TypeChip` + `App.tsx`
9. `UploadPage` rewrite (conditional fields, defaults persistence, new shell styling)
10. `BrowsePage` rewrite (dual date filters, table, chips, `FilterDrawer` mobile)
11. `DocumentDetailPage` (rename, conditional financial rows, `Document Date` always shown)
12. E2E updates + rebrand (`golden-path-contract.spec.ts`, label/path fixes, README, package.json)

---

### Task 1: Migration 002 — rename to documents (idempotent)

**Files:**
- Create: `migrations/002_rename_to_documents.sql`
- Test: `server/test/migrations.test.ts` (overhaul)

- [ ] **Step 1: Write the failing test (fresh DB → documents table with new schema)**

Replace the contents of `server/test/migrations.test.ts` with:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';

describe('migrations', () => {
  let tmp: string;
  let db: DB;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    db = openDatabase(path.join(tmp, 'test.db'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('fresh DB has documents table with 10-value type CHECK + both date indexes', () => {
    runMigrations(db);

    const cols = db
      .prepare(`PRAGMA table_info(documents)`)
      .all() as Array<{ name: string; notnull: number }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toEqual(
      expect.arrayContaining([
        'id',
        'document_name',
        'type',
        'document_date',
        'invoice_date',
        'amount',
        'currency',
        'note',
        'filename',
        'original_name',
        'mime_type',
        'size_bytes',
        'created_at',
      ]),
    );

    const docDate = cols.find((c) => c.name === 'document_date');
    const invDate = cols.find((c) => c.name === 'invoice_date');
    expect(docDate?.notnull).toBe(1);
    expect(invDate?.notnull).toBe(0);

    const indexes = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'documents'`)
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        'idx_documents_document_date',
        'idx_documents_invoice_date',
        'idx_documents_type',
        'idx_documents_created_at',
      ]),
    );

    expect(() =>
      db
        .prepare(
          `INSERT INTO documents (
             id, document_name, type, document_date, invoice_date, amount, currency,
             filename, original_name, mime_type, size_bytes, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          '11111111-1111-4111-8111-111111111111',
          'X',
          'bogus_type',
          '2026-01-01',
          null,
          null,
          null,
          'x.pdf',
          'x.pdf',
          'application/pdf',
          1,
          '2026-01-01T00:00:00.000Z',
        ),
    ).toThrow(/CHECK constraint failed/);
  });

  it('migrating populated receipts → documents backfills document_date from created_at', () => {
    db.exec(`
      CREATE TABLE receipts (
        id TEXT PRIMARY KEY, document_name TEXT, type TEXT, invoice_date TEXT,
        amount INTEGER, currency TEXT, note TEXT, filename TEXT, original_name TEXT,
        mime_type TEXT, size_bytes INTEGER, created_at TEXT);
      INSERT INTO receipts VALUES (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'AWS Jan', 'invoice', '2026-01-15',
        12500, 'THB', null, 'a.pdf', 'aws.pdf', 'application/pdf', 1024,
        '2026-01-20T10:00:00.000Z');
    `);

    runMigrations(db);

    const row = db
      .prepare(`SELECT document_date, invoice_date FROM documents WHERE id = ?`)
      .get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') as { document_date: string; invoice_date: string };
    expect(row.document_date).toBe('2026-01-20');
    expect(row.invoice_date).toBe('2026-01-15');
  });

  it('is idempotent: running twice produces no duplicate FTS rows', () => {
    runMigrations(db);
    db.prepare(
      `INSERT INTO documents (
         id, document_name, type, document_date, invoice_date, amount, currency, note,
         filename, original_name, mime_type, size_bytes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Doc',
      'contract',
      '2026-02-01',
      null,
      null,
      null,
      null,
      'b.pdf',
      'b.pdf',
      'application/pdf',
      1,
      '2026-02-01T00:00:00.000Z',
    );

    runMigrations(db);

    const docs = (db.prepare(`SELECT COUNT(*) AS c FROM documents`).get() as { c: number }).c;
    const fts = (db.prepare(`SELECT COUNT(*) AS c FROM documents_fts`).get() as { c: number }).c;
    expect(fts).toBe(docs);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- server/test/migrations.test.ts
```
Expected: FAIL — table `documents` does not exist / `002_rename_to_documents.sql` missing.

- [ ] **Step 3: Create the migration file**

Create `migrations/002_rename_to_documents.sql`:

```sql
CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  document_name   TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN (
                    'invoice','receipt','quotation','contract','policy',
                    'hr_document','meeting_minutes','report','certificate','other')),
  document_date   TEXT NOT NULL,
  invoice_date    TEXT,
  amount          INTEGER CHECK(amount IS NULL OR amount >= 0),
  currency        TEXT    CHECK(currency IS NULL OR currency IN ('THB','USD','EUR','JPY','CNY')),
  note            TEXT,
  filename        TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at      TEXT NOT NULL
);

INSERT OR IGNORE INTO documents (
  id, document_name, type, document_date, invoice_date,
  amount, currency, note, filename, original_name, mime_type, size_bytes, created_at)
SELECT id, document_name, type,
       substr(created_at, 1, 10) AS document_date,
       invoice_date,
       amount, currency, note, filename, original_name, mime_type, size_bytes, created_at
FROM receipts;

DROP TABLE IF EXISTS receipts_fts;
DROP TABLE IF EXISTS receipts;

CREATE INDEX IF NOT EXISTS idx_documents_document_date ON documents(document_date);
CREATE INDEX IF NOT EXISTS idx_documents_invoice_date  ON documents(invoice_date);
CREATE INDEX IF NOT EXISTS idx_documents_type          ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at    ON documents(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  document_name, note, content='documents', content_rowid='rowid');

INSERT INTO documents_fts(rowid, document_name, note)
  SELECT rowid, document_name, COALESCE(note, '') FROM documents
  WHERE NOT EXISTS (SELECT 1 FROM documents_fts);

CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, document_name, note)
  VALUES (new.rowid, new.document_name, COALESCE(new.note, ''));
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, document_name, note)
  VALUES('delete', old.rowid, old.document_name, COALESCE(old.note, ''));
END;
```

Why the migration runner's lexicographic order works for idempotency: `001_init.sql` always runs first on every boot and recreates the empty `receipts` table; then `002` runs and `INSERT OR IGNORE … FROM receipts` copies 0 rows (since it was just recreated), then drops it again. The `WHERE NOT EXISTS` guard on the FTS populate is the part that prevents the FTS duplicate-row bug — without it, every boot would re-INSERT rows into `documents_fts` via the bulk populate while the `AFTER INSERT` trigger has already kept it in sync.

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- server/test/migrations.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add migrations/002_rename_to_documents.sql server/test/migrations.test.ts
git commit -m "feat(db): add documents table migration with FTS idempotency"
```

---

### Task 2: Shared schemas — Document types + discriminated union + requiresFinancials

**Files:**
- Modify: `shared/schemas.ts`
- Test: `shared/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `shared/schemas.test.ts` contents with:

```typescript
import { describe, it, expect } from 'vitest';
import {
  DocumentCreateSchema,
  DocumentDTOSchema,
  ListQuerySchema,
  DOCUMENT_TYPES,
  REQUIRES_FINANCIALS,
  requiresFinancials,
} from './schemas.js';

describe('DOCUMENT_TYPES', () => {
  it('has 10 values', () => {
    expect(DOCUMENT_TYPES).toHaveLength(10);
    expect(DOCUMENT_TYPES).toEqual(
      expect.arrayContaining([
        'invoice',
        'receipt',
        'quotation',
        'contract',
        'policy',
        'hr_document',
        'meeting_minutes',
        'report',
        'certificate',
        'other',
      ]),
    );
  });
});

describe('requiresFinancials', () => {
  it('returns true only for invoice and receipt', () => {
    expect(requiresFinancials('invoice')).toBe(true);
    expect(requiresFinancials('receipt')).toBe(true);
    expect(requiresFinancials('contract')).toBe(false);
    expect(requiresFinancials('policy')).toBe(false);
    expect(requiresFinancials('other')).toBe(false);
  });

  it('REQUIRES_FINANCIALS set matches the helper', () => {
    expect(REQUIRES_FINANCIALS.has('invoice')).toBe(true);
    expect(REQUIRES_FINANCIALS.has('contract')).toBe(false);
  });
});

describe('DocumentCreateSchema', () => {
  const validInvoice = {
    documentName: 'AWS Jan',
    type: 'invoice',
    invoiceDate: '2026-01-15',
    amount: 12500,
    currency: 'THB',
  };

  it('accepts an invoice with financials', () => {
    expect(() => DocumentCreateSchema.parse(validInvoice)).not.toThrow();
  });

  it('rejects an invoice missing amount', () => {
    const r = DocumentCreateSchema.safeParse({ ...validInvoice, amount: undefined });
    expect(r.success).toBe(false);
  });

  it('rejects an invoice missing invoiceDate', () => {
    const r = DocumentCreateSchema.safeParse({ ...validInvoice, invoiceDate: undefined });
    expect(r.success).toBe(false);
  });

  it('accepts a contract with no financial fields', () => {
    expect(() =>
      DocumentCreateSchema.parse({ documentName: 'NDA 2026', type: 'contract' }),
    ).not.toThrow();
  });

  it('accepts a contract that happens to include null financials (optional)', () => {
    expect(() =>
      DocumentCreateSchema.parse({
        documentName: 'NDA 2026',
        type: 'contract',
        note: 'signed',
      }),
    ).not.toThrow();
  });

  it('strips any client-supplied documentDate (never accepted from client)', () => {
    const parsed = DocumentCreateSchema.parse({
      ...validInvoice,
      documentDate: '2099-12-31',
    } as unknown as typeof validInvoice);
    expect((parsed as Record<string, unknown>).documentDate).toBeUndefined();
  });
});

describe('DocumentDTOSchema', () => {
  it('requires documentDate (string) and allows null invoiceDate/amount/currency', () => {
    expect(() =>
      DocumentDTOSchema.parse({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        documentName: 'NDA',
        type: 'contract',
        documentDate: '2026-05-16',
        invoiceDate: null,
        amount: null,
        currency: null,
        filename: 'x.pdf',
        originalName: 'x.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        createdAt: '2026-05-16T00:00:00.000Z',
      }),
    ).not.toThrow();
  });
});

describe('ListQuerySchema', () => {
  it('accepts the four date params independently', () => {
    const a = ListQuerySchema.parse({ invoiceDateFrom: '2026-01-01' });
    const b = ListQuerySchema.parse({ uploadDateTo: '2026-12-31' });
    const c = ListQuerySchema.parse({
      invoiceDateFrom: '2026-01-01',
      invoiceDateTo: '2026-01-31',
      uploadDateFrom: '2026-01-01',
      uploadDateTo: '2026-12-31',
    });
    expect(a.invoiceDateFrom).toBe('2026-01-01');
    expect(b.uploadDateTo).toBe('2026-12-31');
    expect(c.uploadDateFrom).toBe('2026-01-01');
  });

  it('rejects a malformed date', () => {
    expect(ListQuerySchema.safeParse({ uploadDateFrom: '01/01/2026' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- shared/schemas.test.ts
```
Expected: FAIL — `DocumentCreateSchema`, `requiresFinancials`, etc. not exported.

- [ ] **Step 3: Rewrite `shared/schemas.ts`**

Replace `shared/schemas.ts` with:

```typescript
import { z } from 'zod';

export const DOCUMENT_TYPES = [
  'invoice',
  'receipt',
  'quotation',
  'contract',
  'policy',
  'hr_document',
  'meeting_minutes',
  'report',
  'certificate',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const CURRENCIES = ['THB', 'USD', 'EUR', 'JPY', 'CNY'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const REQUIRES_FINANCIALS = new Set<DocumentType>(['invoice', 'receipt']);

export function requiresFinancials(type: DocumentType): boolean {
  return REQUIRES_FINANCIALS.has(type);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

const FinancialFields = {
  invoiceDate: isoDate,
  amount: z.number().int().nonnegative(),
  currency: z.enum(CURRENCIES),
};

const baseFields = {
  documentName: z.string().min(1).max(200),
  note: z.string().max(2000).optional(),
};

const financialVariants = (['invoice', 'receipt'] as const).map((t) =>
  z.object({
    ...baseFields,
    type: z.literal(t),
    ...FinancialFields,
  }),
);

const nonFinancialTypes = DOCUMENT_TYPES.filter(
  (t) => !REQUIRES_FINANCIALS.has(t),
) as ReadonlyArray<Exclude<DocumentType, 'invoice' | 'receipt'>>;

const nonFinancialVariants = nonFinancialTypes.map((t) =>
  z.object({
    ...baseFields,
    type: z.literal(t),
    invoiceDate: isoDate.optional(),
    amount: z.number().int().nonnegative().optional(),
    currency: z.enum(CURRENCIES).optional(),
  }),
);

export const DocumentCreateSchema = z.discriminatedUnion('type', [
  ...financialVariants,
  ...nonFinancialVariants,
] as unknown as readonly [
  (typeof financialVariants)[number],
  ...(typeof financialVariants | typeof nonFinancialVariants)[number][],
]);
export type DocumentCreate = z.infer<typeof DocumentCreateSchema>;

export const DocumentDTOSchema = z.object({
  id: z.string().uuid(),
  documentName: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  documentDate: isoDate,
  invoiceDate: isoDate.nullable(),
  amount: z.number().int().nonnegative().nullable(),
  currency: z.enum(CURRENCIES).nullable(),
  note: z.string().optional(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type DocumentDTO = z.infer<typeof DocumentDTOSchema>;

export const ListQuerySchema = z.object({
  type: z.enum(DOCUMENT_TYPES).optional(),
  invoiceDateFrom: isoDate.optional(),
  invoiceDateTo: isoDate.optional(),
  uploadDateFrom: isoDate.optional(),
  uploadDateTo: isoDate.optional(),
  q: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
```

Notes for the implementing engineer:
- `z.object` strips unknown keys by default, which is why the "client-supplied documentDate is dropped" test passes.
- `z.discriminatedUnion` gives nice field-level errors like `fields.amount` automatically through the existing `errorHandler.ts` because zod's `ZodError.flatten()` is what `errorHandler` already consumes.

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- shared/schemas.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/schemas.ts shared/schemas.test.ts
git commit -m "feat(shared): Document* schemas with discriminated-union financials"
```

> **Note:** Server and client will not typecheck after this commit. Subsequent tasks restore correctness incrementally; final commit at end of Task 6 puts the server back to GREEN.

---

### Task 3: FileStore — invoiceDate parameter renamed to createdAt

**Files:**
- Modify: `server/src/storage/fileStore.ts`
- Test: `server/test/fileStore.test.ts`

- [ ] **Step 1: Update failing tests**

Edit `server/test/fileStore.test.ts` to use `createdAt`-shaped strings everywhere. Replace the file's body with:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createFileStore } from '../src/storage/fileStore.js';

describe('fileStore', () => {
  let root: string;
  let store: ReturnType<typeof createFileStore>;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-'));
    store = createFileStore(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('derives YYYY/MM/uuid.ext path from the createdAt ISO timestamp', () => {
    const p = store.derivePath(
      'aaaa1111-2222-4333-8444-555566667777',
      'pdf',
      '2026-03-15T08:30:00.000Z',
    );
    expect(p).toMatch(/2026[\\/]03[\\/]aaaa1111-2222-4333-8444-555566667777\.pdf$/);
  });

  it('writes bytes and creates the directory tree (createdAt-derived path)', async () => {
    await store.write(
      '11111111-1111-4111-8111-111111111111',
      'png',
      '2026-01-10T12:00:00.000Z',
      Buffer.from('hi'),
    );
    const written = fs.readFileSync(
      path.join(root, '2026', '01', '11111111-1111-4111-8111-111111111111.png'),
    );
    expect(written.toString()).toBe('hi');
  });

  it('openStream reads back what was written', async () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const t = '2026-02-01T03:00:00.000Z';
    await store.write(id, 'jpg', t, Buffer.from('hello'));
    const stream = store.openStream(id, 'jpg', t);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as Readable) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('hello');
  });

  it('exists returns false for missing files', () => {
    expect(
      store.exists('99999999-9999-4999-8999-999999999999', 'pdf', '2026-01-01T00:00:00.000Z'),
    ).toBe(false);
  });

  it('unlink removes the file', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    const t = '2026-04-01T00:00:00.000Z';
    await store.write(id, 'pdf', t, Buffer.from('x'));
    await store.unlink(id, 'pdf', t);
    expect(store.exists(id, 'pdf', t)).toBe(false);
  });

  it('unlink does not throw if file already missing', async () => {
    await expect(
      store.unlink('44444444-4444-4444-8444-444444444444', 'pdf', '2026-04-01T00:00:00.000Z'),
    ).resolves.toBeUndefined();
  });

  it('reset wipes the root and recreates it for subsequent writes', async () => {
    const id = '55555555-5555-4555-8555-555555555555';
    const t = '2026-05-01T00:00:00.000Z';
    await store.write(id, 'pdf', t, Buffer.from('before'));
    expect(store.exists(id, 'pdf', t)).toBe(true);
    await store.reset();
    expect(store.exists(id, 'pdf', t)).toBe(false);
    expect(fs.existsSync(root)).toBe(true);
    await store.write(id, 'pdf', t, Buffer.from('after'));
    expect(store.exists(id, 'pdf', t)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- server/test/fileStore.test.ts
```
Expected: PASS for any tests that happen to still match (parsing first 7 chars works for both `YYYY-MM-DD` and `YYYY-MM-DDTHH…`), but the engineer's job is to rename the parameter for readability — the test file's variable rename is the actual change driver.

Even if the test passes now, proceed to Step 3 so the parameter name is correct.

- [ ] **Step 3: Update `server/src/storage/fileStore.ts`**

Replace the file with:

```typescript
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';

export function createFileStore(root: string) {
  function derivePath(id: string, ext: string, createdAt: string): string {
    const year = createdAt.slice(0, 4);
    const month = createdAt.slice(5, 7);
    return path.join(root, year, month, `${id}.${ext}`);
  }

  async function write(id: string, ext: string, createdAt: string, bytes: Buffer): Promise<void> {
    const full = derivePath(id, ext, createdAt);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, bytes);
  }

  function openStream(id: string, ext: string, createdAt: string): NodeJS.ReadableStream {
    return createReadStream(derivePath(id, ext, createdAt));
  }

  function exists(id: string, ext: string, createdAt: string): boolean {
    return fs.existsSync(derivePath(id, ext, createdAt));
  }

  async function unlink(id: string, ext: string, createdAt: string): Promise<void> {
    try {
      await fsp.unlink(derivePath(id, ext, createdAt));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
    }
  }

  async function reset(): Promise<void> {
    await fsp.rm(root, { recursive: true, force: true });
    await fsp.mkdir(root, { recursive: true });
  }

  return { derivePath, write, openStream, exists, unlink, reset };
}

export type FileStore = ReturnType<typeof createFileStore>;
```

The slice math (`[0..4]` and `[5..7]`) works identically for `2026-03-15` and `2026-03-15T08:30:00.000Z`.

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- server/test/fileStore.test.ts
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/storage/fileStore.ts server/test/fileStore.test.ts
git commit -m "refactor(server): rename FileStore date param to createdAt"
```

---

### Task 4: documentsRepo — rename, dual date filters, nullable financials

**Files:**
- Create: `server/src/db/documentsRepo.ts`
- Delete: `server/src/db/receiptsRepo.ts`
- Create: `server/test/documentsRepo.test.ts`
- Delete: `server/test/receiptsRepo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/documentsRepo.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createDocumentsRepo } from '../src/db/documentsRepo.js';
import type { DocumentDTO } from '../../shared/schemas.js';

const baseInvoice: DocumentDTO = {
  id: '11111111-1111-4111-8111-111111111111',
  documentName: 'AWS January',
  type: 'invoice',
  documentDate: '2026-01-20',
  invoiceDate: '2026-01-15',
  amount: 12500,
  currency: 'THB',
  note: 'monthly',
  filename: '11111111-1111-4111-8111-111111111111.pdf',
  originalName: 'aws-jan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: '2026-01-20T10:00:00.000Z',
};

const baseContract: DocumentDTO = {
  ...baseInvoice,
  id: '22222222-2222-4222-8222-222222222222',
  documentName: 'NDA 2026',
  type: 'contract',
  documentDate: '2026-02-10',
  invoiceDate: null,
  amount: null,
  currency: null,
  note: undefined,
  createdAt: '2026-02-10T08:00:00.000Z',
};

describe('documentsRepo', () => {
  let tmp: string;
  let db: DB;
  let repo: ReturnType<typeof createDocumentsRepo>;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
    db = openDatabase(path.join(tmp, 'test.db'));
    runMigrations(db);
    repo = createDocumentsRepo(db);
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('insert + getById roundtrip for a financial document', () => {
    repo.insert(baseInvoice);
    expect(repo.getById(baseInvoice.id)).toMatchObject(baseInvoice);
  });

  it('insert + getById roundtrip for a non-financial document (nulls preserved)', () => {
    repo.insert(baseContract);
    const back = repo.getById(baseContract.id);
    expect(back?.invoiceDate).toBeNull();
    expect(back?.amount).toBeNull();
    expect(back?.currency).toBeNull();
    expect(back?.documentDate).toBe('2026-02-10');
  });

  it('list orders by document_date DESC then created_at DESC', () => {
    repo.insert({ ...baseInvoice, id: 'a'.repeat(8) + '-1111-4111-8111-111111111111', documentDate: '2026-01-01' });
    repo.insert({ ...baseInvoice, id: 'b'.repeat(8) + '-1111-4111-8111-111111111111', documentDate: '2026-03-01' });
    const { items } = repo.list({ page: 1, pageSize: 20 });
    expect(items[0]?.documentDate).toBe('2026-03-01');
  });

  it('list filters by type across the new enum', () => {
    repo.insert({ ...baseInvoice, id: 'c'.repeat(8) + '-1111-4111-8111-111111111111', type: 'policy', invoiceDate: null, amount: null, currency: null });
    repo.insert({ ...baseInvoice, id: 'd'.repeat(8) + '-1111-4111-8111-111111111111', type: 'invoice' });
    expect(repo.list({ type: 'policy', page: 1, pageSize: 20 }).total).toBe(1);
    expect(repo.list({ type: 'invoice', page: 1, pageSize: 20 }).total).toBe(1);
  });

  it('invoiceDateFrom/To excludes rows with NULL invoice_date', () => {
    repo.insert(baseInvoice);
    repo.insert(baseContract);
    const r = repo.list({ invoiceDateFrom: '2026-01-01', invoiceDateTo: '2026-12-31', page: 1, pageSize: 20 });
    expect(r.total).toBe(1);
    expect(r.items[0]?.id).toBe(baseInvoice.id);
  });

  it('uploadDateFrom/To filters on document_date and includes non-financial rows', () => {
    repo.insert(baseInvoice);
    repo.insert(baseContract);
    const r = repo.list({ uploadDateFrom: '2026-02-01', uploadDateTo: '2026-02-28', page: 1, pageSize: 20 });
    expect(r.total).toBe(1);
    expect(r.items[0]?.id).toBe(baseContract.id);
  });

  it('combining invoiceDate and uploadDate filters narrows correctly', () => {
    repo.insert(baseInvoice); // invDate 2026-01-15, docDate 2026-01-20
    repo.insert(baseContract); // invDate null, docDate 2026-02-10
    repo.insert({
      ...baseInvoice,
      id: 'e'.repeat(8) + '-1111-4111-8111-111111111111',
      invoiceDate: '2026-02-15',
      documentDate: '2026-02-20',
    });

    const r = repo.list({
      invoiceDateFrom: '2026-02-01',
      uploadDateFrom: '2026-02-01',
      page: 1,
      pageSize: 20,
    });
    expect(r.total).toBe(1);
    expect(r.items[0]?.invoiceDate).toBe('2026-02-15');
  });

  it('list searches FTS by q across new schema', () => {
    repo.insert({ ...baseInvoice, documentName: 'AWS January' });
    repo.insert({ ...baseInvoice, id: 'f'.repeat(8) + '-1111-4111-8111-111111111111', documentName: 'GitHub bill' });
    const r = repo.list({ q: 'AWS', page: 1, pageSize: 20 });
    expect(r.total).toBe(1);
  });

  it('delete returns true/false; deleted rows leave FTS empty', () => {
    repo.insert(baseInvoice);
    expect(repo.delete(baseInvoice.id)).toBe(true);
    expect(repo.delete(baseInvoice.id)).toBe(false);
    expect(repo.list({ q: 'AWS', page: 1, pageSize: 20 }).total).toBe(0);
  });

  it('reset clears table and FTS', () => {
    repo.insert(baseInvoice);
    repo.insert(baseContract);
    repo.reset();
    expect(repo.list({ page: 1, pageSize: 20 }).total).toBe(0);
    expect(repo.list({ q: 'AWS', page: 1, pageSize: 20 }).total).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- server/test/documentsRepo.test.ts
```
Expected: FAIL — `createDocumentsRepo` not exported / module missing.

- [ ] **Step 3: Create `server/src/db/documentsRepo.ts`**

```typescript
import type { DB } from './connection.js';
import type { DocumentDTO, DocumentType, Currency, ListQuery } from '../../../shared/schemas.js';

interface DocumentRow {
  id: string;
  document_name: string;
  type: DocumentType;
  document_date: string;
  invoice_date: string | null;
  amount: number | null;
  currency: Currency | null;
  note: string | null;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

function rowToDTO(r: DocumentRow): DocumentDTO {
  return {
    id: r.id,
    documentName: r.document_name,
    type: r.type,
    documentDate: r.document_date,
    invoiceDate: r.invoice_date,
    amount: r.amount,
    currency: r.currency,
    note: r.note ?? undefined,
    filename: r.filename,
    originalName: r.original_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  };
}

export interface ListResult {
  items: DocumentDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export function createDocumentsRepo(db: DB) {
  const insertStmt = db.prepare(`
    INSERT INTO documents (
      id, document_name, type, document_date, invoice_date, amount, currency, note,
      filename, original_name, mime_type, size_bytes, created_at
    ) VALUES (
      @id, @documentName, @type, @documentDate, @invoiceDate, @amount, @currency, @note,
      @filename, @originalName, @mimeType, @sizeBytes, @createdAt
    )
  `);

  const getStmt = db.prepare(`SELECT * FROM documents WHERE id = ?`);
  const deleteStmt = db.prepare(`DELETE FROM documents WHERE id = ?`);

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
    if (q.invoiceDateFrom) {
      where.push('d.invoice_date >= ?');
      params.push(q.invoiceDateFrom);
    }
    if (q.invoiceDateTo) {
      where.push('d.invoice_date <= ?');
      params.push(q.invoiceDateTo);
    }
    if (q.uploadDateFrom) {
      where.push('d.document_date >= ?');
      params.push(q.uploadDateFrom);
    }
    if (q.uploadDateTo) {
      where.push('d.document_date <= ?');
      params.push(q.uploadDateTo);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT d.* ${fromClause} ${whereClause} ${orderBy} LIMIT ? OFFSET ?`;
    const countSQL = `SELECT COUNT(*) AS c ${fromClause} ${whereClause}`;
    return { sql, countSQL, params };
  }

  return {
    insert(dto: DocumentDTO): void {
      insertStmt.run({
        id: dto.id,
        documentName: dto.documentName,
        type: dto.type,
        documentDate: dto.documentDate,
        invoiceDate: dto.invoiceDate,
        amount: dto.amount,
        currency: dto.currency,
        note: dto.note ?? null,
        filename: dto.filename,
        originalName: dto.originalName,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        createdAt: dto.createdAt,
      });
    },

    getById(id: string): DocumentDTO | null {
      const row = getStmt.get(id) as DocumentRow | undefined;
      return row ? rowToDTO(row) : null;
    },

    list(q: ListQuery): ListResult {
      const { sql, countSQL, params } = buildListSQL(q);
      const offset = (q.page - 1) * q.pageSize;
      const rows = db.prepare(sql).all(...params, q.pageSize, offset) as DocumentRow[];
      const total = (db.prepare(countSQL).get(...params) as { c: number }).c;
      return { items: rows.map(rowToDTO), total, page: q.page, pageSize: q.pageSize };
    },

    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },

    reset(): void {
      db.prepare('DELETE FROM documents').run();
    },
  };
}
```

The natural exclusion of NULL `invoice_date` rows from `invoiceDateFrom/To` filters happens by default in SQLite — `NULL >= '...'` evaluates to NULL (not TRUE), so the row is filtered out without needing an explicit `IS NOT NULL` clause.

- [ ] **Step 4: Delete old repo + test files**

```bash
git rm server/src/db/receiptsRepo.ts server/test/receiptsRepo.test.ts
```

- [ ] **Step 5: Run tests to verify they pass**

```
npm test -- server/test/documentsRepo.test.ts
```
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/db/documentsRepo.ts server/test/documentsRepo.test.ts
git commit -m "feat(server): documentsRepo with dual date filters and nullable financials"
```

---

### Task 5: /api/documents route

**Files:**
- Create: `server/src/routes/documents.ts`
- Delete: `server/src/routes/receipts.ts`
- Modify: `server/test/upload.test.ts`
- Modify: `server/test/list.test.ts`
- Modify: `server/test/detail-and-download.test.ts`
- Modify: `server/test/delete.test.ts`
- Modify: `server/test/testReset.test.ts` (route path only)

- [ ] **Step 1: Update `upload.test.ts` with failing tests**

Replace `server/test/upload.test.ts` body with:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('POST /api/documents', () => {
  let env: ReturnType<typeof makeTestEnv>;
  beforeEach(() => (env = makeTestEnv()));
  afterEach(() => env.cleanup());

  const validInvoice = {
    documentName: 'Test',
    type: 'invoice' as const,
    invoiceDate: '2026-01-15',
    amount: 100,
    currency: 'THB' as const,
  };
  const validContract = {
    documentName: 'NDA',
    type: 'contract' as const,
  };

  it('uploads invoice PDF → 201, DTO has documentDate set to today, invoice_date preserved', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yyyy = today.slice(0, 4);
    const mm = today.slice(5, 7);

    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(validInvoice))
      .attach('file', env.fixtures.PDF_MIN, 'test.pdf');
    expect(res.status).toBe(201);
    expect(res.body.documentDate).toBe(today);
    expect(res.body.invoiceDate).toBe('2026-01-15');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);

    const onDisk = path.join(env.tmp, 'file', yyyy, mm, `${res.body.id}.pdf`);
    expect(fs.existsSync(onDisk)).toBe(true);
  });

  it('uploads contract → 201, response invoiceDate/amount/currency are null', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(validContract))
      .attach('file', env.fixtures.PDF_MIN, 'nda.pdf');
    expect(res.status).toBe(201);
    expect(res.body.invoiceDate).toBeNull();
    expect(res.body.amount).toBeNull();
    expect(res.body.currency).toBeNull();
    expect(res.body.documentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects invoice missing amount with VALIDATION + fields.amount', async () => {
    const bad = { ...validInvoice } as Record<string, unknown>;
    delete bad.amount;
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(bad))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.fields.amount).toBeTruthy();
  });

  it('client-supplied documentDate is ignored (server overrides)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(env.app)
      .post('/api/documents')
      .field(
        'metadata',
        JSON.stringify({ ...validInvoice, documentDate: '2099-12-31' }),
      )
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(201);
    expect(res.body.documentDate).toBe(today);
  });

  it('rejects missing metadata', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
  });

  it('rejects bad metadata JSON', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', '{not json')
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
  });

  it('rejects unknown type', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify({ ...validInvoice, type: 'bogus' }))
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.fields.type).toBeTruthy();
  });

  it('rejects file that fails byte-sniff', async () => {
    const res = await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(validInvoice))
      .attach('file', Buffer.from('not a real file'), 'fake.pdf');
    expect(res.status).toBe(415);
  });

  it('writes no DB row if upload is rejected (atomicity)', async () => {
    await request(env.app)
      .post('/api/documents')
      .field('metadata', JSON.stringify(validInvoice))
      .attach('file', Buffer.from('garbage'), 'fake.pdf');
    const { total } = env.repo.list({ page: 1, pageSize: 10 });
    expect(total).toBe(0);
  });
});
```

- [ ] **Step 2: Update `list.test.ts`, `detail-and-download.test.ts`, `delete.test.ts`, `testReset.test.ts`**

For each, run the following sed-like replacements (the engineer should do these via Edit tool for safety, file-by-file):

| Old | New |
|---|---|
| `/api/receipts` | `/api/documents` |
| `receipt` (URL/route context only) | `document` |
| `dateFrom` (query param) | `uploadDateFrom` if the test was filtering by upload date, else `invoiceDateFrom` |
| `dateTo` | `uploadDateTo` / `invoiceDateTo` accordingly |
| Path assertions reading year/month from `invoiceDate` | use the row's `createdAt` slice `[0..4]/[5..7]` |

For `list.test.ts` specifically: add a new test exercising the dual filter:

```typescript
it('filters by uploadDate independently of invoiceDate', async () => {
  // Insert one invoice (invoiceDate 2026-01-15, server-assigned today)
  // Insert one contract (invoiceDate null, server-assigned today)
  // List with uploadDateFrom=today → expect both rows
  // List with invoiceDateFrom=2026-01-01 → expect only the invoice
});
```

(Fill in the actual setup using the same `request(env.app).post('/api/documents')` style as `upload.test.ts`.)

- [ ] **Step 3: Run failing tests**

```
npm test -- server/test/upload.test.ts
```
Expected: FAIL — route `/api/documents` not yet mounted (still `/api/receipts`).

- [ ] **Step 4: Create `server/src/routes/documents.ts`**

```typescript
import { Router, type Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import { DocumentCreateSchema, ListQuerySchema, type DocumentDTO } from '../../../shared/schemas.js';
import { ApiError } from '../middleware/errorHandler.js';
import { uploadMiddleware, sniffOrThrow, multerErrorAsApiError } from '../middleware/upload.js';
import type { createDocumentsRepo } from '../db/documentsRepo.js';
import type { FileStore } from '../storage/fileStore.js';

interface Deps {
  repo: ReturnType<typeof createDocumentsRepo>;
  store: FileStore;
}

function parseMetadata(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    throw new ApiError(400, 'VALIDATION', 'metadata field is required');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'VALIDATION', 'metadata is not valid JSON');
  }
}

export function documentsRouter(deps: Deps): Router {
  const { repo, store } = deps;
  const r = Router();

  r.post('/', (req, res, next) => {
    uploadMiddleware(req, res, async (err) => {
      try {
        const mapped = multerErrorAsApiError(err);
        if (mapped) throw mapped;
        if (err) throw err;

        const file = (req as Request & { file?: Express.Multer.File }).file;
        if (!file) throw new ApiError(400, 'VALIDATION', 'file is required');

        const rawMeta = parseMetadata((req.body as Record<string, unknown>).metadata);
        const meta = DocumentCreateSchema.parse(rawMeta);

        const { mime, ext } = await sniffOrThrow(file.buffer);

        const id = uuidv4();
        const now = new Date().toISOString();
        const today = now.slice(0, 10);
        const filename = `${id}.${ext}`;

        await store.write(id, ext, now, file.buffer);

        const dto: DocumentDTO = {
          id,
          documentName: meta.documentName,
          type: meta.type,
          documentDate: today,
          invoiceDate: 'invoiceDate' in meta ? (meta.invoiceDate ?? null) : null,
          amount: 'amount' in meta ? (meta.amount ?? null) : null,
          currency: 'currency' in meta ? (meta.currency ?? null) : null,
          note: meta.note,
          filename,
          originalName: file.originalname,
          mimeType: mime,
          sizeBytes: file.size,
          createdAt: now,
        };

        try {
          repo.insert(dto);
        } catch (e) {
          await store.unlink(id, ext, now);
          throw e;
        }

        res.status(201).json(dto);
      } catch (e) {
        next(e);
      }
    });
  });

  r.get('/', (req, res, next) => {
    try {
      const q = ListQuerySchema.parse(req.query);
      res.json(repo.list(q));
    } catch (e) {
      next(e);
    }
  });

  r.get('/:id', (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      const dto = repo.getById(id);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'document not found');
      res.json(dto);
    } catch (e) {
      next(e);
    }
  });

  r.get('/:id/file', (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      const dto = repo.getById(id);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'document not found');
      const ext = path.extname(dto.filename).slice(1);
      if (!store.exists(id, ext, dto.createdAt)) {
        throw new ApiError(410, 'FILE_GONE', 'file is no longer in storage');
      }
      res.setHeader('Content-Type', dto.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${dto.originalName.replace(/"/g, '')}"`,
      );
      store.openStream(id, ext, dto.createdAt).pipe(res);
    } catch (e) {
      next(e);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      const dto = repo.getById(id);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'document not found');
      const ext = path.extname(dto.filename).slice(1);
      repo.delete(id);
      await store.unlink(id, ext, dto.createdAt);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
```

- [ ] **Step 5: Delete old route**

```bash
git rm server/src/routes/receipts.ts
```

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/documents.ts server/test/upload.test.ts server/test/list.test.ts server/test/detail-and-download.test.ts server/test/delete.test.ts server/test/testReset.test.ts
git commit -m "feat(server): /api/documents route with server-assigned documentDate"
```

> Tests still fail because `app.ts` mounts the old router. Task 6 wires it up.

---

### Task 6: App wiring + test helpers + server index — back to GREEN

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/index.ts`
- Modify: `server/test/helpers.ts`

- [ ] **Step 1: Edit `server/src/app.ts`**

```typescript
import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { documentsRouter } from './routes/documents.js';
import { healthRouter } from './routes/health.js';
import type { createDocumentsRepo } from './db/documentsRepo.js';
import type { FileStore } from './storage/fileStore.js';

export interface AppDeps {
  repo: ReturnType<typeof createDocumentsRepo>;
  store: FileStore;
  staticDir?: string;
  testResetEnabled?: boolean;
}

export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use('/api/health', healthRouter());
  if (deps.testResetEnabled) {
    app.post('/api/test/reset', async (_req, res, next) => {
      try {
        deps.repo.reset();
        await deps.store.reset();
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });
  }
  app.use('/api/documents', documentsRouter(deps));
  if (deps.staticDir) {
    app.use(express.static(deps.staticDir));
    app.get('*', (_req, res) => res.sendFile('index.html', { root: deps.staticDir }));
  }
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 2: Edit `server/src/index.ts`**

```typescript
import fs from 'node:fs';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrations.js';
import { createDocumentsRepo } from './db/documentsRepo.js';
import { createFileStore } from './storage/fileStore.js';
import { buildApp } from './app.js';
import path from 'node:path';

function assertWritable(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.write-probe-${process.pid}`);
  fs.writeFileSync(probe, '');
  fs.unlinkSync(probe);
}

function main(): void {
  const cfg = loadConfig(process.env);
  logger.info({ port: cfg.port, dataDir: cfg.dataDir }, 'starting');

  assertWritable(cfg.fileRoot);
  assertWritable(path.dirname(cfg.dbPath));

  const db = openDatabase(cfg.dbPath);
  runMigrations(db);
  const repo = createDocumentsRepo(db);
  const store = createFileStore(cfg.fileRoot);

  const staticDir = path.resolve(process.cwd(), 'client/dist');
  const app = buildApp({
    repo,
    store,
    staticDir: fs.existsSync(staticDir) ? staticDir : undefined,
    testResetEnabled: process.env.E2E_RESET_ENABLED === '1',
  });

  const server = app.listen(cfg.port, () => {
    logger.info({ port: cfg.port }, 'listening');
  });

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.info({ sig }, 'shutting down');
      server.close(() => {
        db.close();
        process.exit(0);
      });
    });
  }
}

main();
```

- [ ] **Step 3: Edit `server/test/helpers.ts`**

```typescript
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Express } from 'express';
import { buildApp } from '../src/app.js';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createDocumentsRepo } from '../src/db/documentsRepo.js';
import { createFileStore } from '../src/storage/fileStore.js';

const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000d49444154789c63000100000005000100020a2d4b000000000049454e44ae426082',
  'hex',
);

const PDF_MIN = Buffer.from(
  '%PDF-1.1\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f \n' +
    'trailer\n<</Root 1 0 R>>\nstartxref\n47\n%%EOF',
);

export interface MakeTestEnvOptions {
  testResetEnabled?: boolean;
}

export function makeTestEnv(opts: MakeTestEnvOptions = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-it-'));
  fs.mkdirSync(path.join(tmp, 'db'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'file'), { recursive: true });
  const db: DB = openDatabase(path.join(tmp, 'db', 'documents.db'));
  runMigrations(db);
  const repo = createDocumentsRepo(db);
  const store = createFileStore(path.join(tmp, 'file'));
  const app: Express = buildApp({ repo, store, testResetEnabled: opts.testResetEnabled });
  return {
    tmp,
    db,
    repo,
    store,
    app,
    cleanup() {
      db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
    fixtures: { PNG_1x1, PDF_MIN },
  };
}
```

- [ ] **Step 4: Run the full server test suite**

```
npm test -- server/test/
```
Expected: PASS (all server suites).

- [ ] **Step 5: Run typecheck**

```
npx tsc -p tsconfig.server.json --noEmit
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add server/src/app.ts server/src/index.ts server/test/helpers.ts
git commit -m "refactor(server): wire /api/documents and rename helpers"
```

---

### Task 7: Client api.ts — endpoints, DTO types, dual date params

**Files:**
- Modify: `client/src/api.ts`
- Modify: `client/src/api.test.ts`

- [ ] **Step 1: Edit `client/src/api.test.ts`**

Replace the test body:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './api.js';

function mockResponses(...responses: Array<Partial<Response> & { jsonBody?: unknown }>) {
  let i = 0;
  global.fetch = vi.fn(async (input?: unknown) => {
    const r = responses[i++] ?? responses[responses.length - 1]!;
    const make = () =>
      ({
        ok: (r.status ?? 200) < 400,
        status: r.status ?? 200,
        url: typeof input === 'string' ? input : '',
        json: async () => r.jsonBody,
        blob: async () => new Blob(['x']),
        clone() {
          return make();
        },
      }) as unknown as Response;
    return make();
  });
}

describe('api', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('list calls /api/documents and resolves with body', async () => {
    mockResponses({ status: 200, jsonBody: { items: [], total: 0, page: 1, pageSize: 20 } });
    const res = await api.list({});
    expect(res.total).toBe(0);
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(String(calls[0]?.[0])).toMatch(/^\/api\/documents/);
  });

  it('list serializes invoiceDateFrom/To and uploadDateFrom/To independently', async () => {
    mockResponses({ status: 200, jsonBody: { items: [], total: 0, page: 1, pageSize: 20 } });
    await api.list({
      invoiceDateFrom: '2026-01-01',
      uploadDateTo: '2026-12-31',
    });
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const url = String(calls[0]?.[0]);
    expect(url).toContain('invoiceDateFrom=2026-01-01');
    expect(url).toContain('uploadDateTo=2026-12-31');
  });

  it('retries once on DB_BUSY then resolves', async () => {
    mockResponses(
      { status: 503, jsonBody: { error: { code: 'DB_BUSY', message: 'busy' } } },
      { status: 200, jsonBody: { items: [], total: 0, page: 1, pageSize: 20 } },
    );
    const res = await api.list({});
    expect(res.total).toBe(0);
    expect((global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
  });

  it('does not retry on non-busy errors', async () => {
    mockResponses({ status: 404, jsonBody: { error: { code: 'NOT_FOUND', message: 'no' } } });
    await expect(api.getById('x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- client/src/api.test.ts
```
Expected: FAIL — URLs still point at `/api/receipts`, `ListQuery` shape mismatch.

- [ ] **Step 3: Edit `client/src/api.ts`**

```typescript
import type { DocumentCreate, DocumentDTO, ListQuery } from './types.js';

export interface ApiErrorShape {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiClientError extends Error implements ApiErrorShape {
  constructor(
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public status?: number,
  ) {
    super(message);
  }
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const doFetch = () => fetch(input, init);
  let res = await doFetch();
  if (res.status === 503) {
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    if (body?.error?.code === 'DB_BUSY') {
      await new Promise((r) => setTimeout(r, 250));
      res = await doFetch();
    }
  }
  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ error: { code: 'INTERNAL', message: res.statusText } }));
    throw new ApiClientError(
      body.error?.code ?? 'INTERNAL',
      body.error?.message ?? 'Request failed',
      body.error?.fields,
      res.status,
    );
  }
  return (await res.json()) as T;
}

function buildQuery(q: Partial<ListQuery>): string {
  const sp = new URLSearchParams();
  if (q.type) sp.set('type', q.type);
  if (q.invoiceDateFrom) sp.set('invoiceDateFrom', q.invoiceDateFrom);
  if (q.invoiceDateTo) sp.set('invoiceDateTo', q.invoiceDateTo);
  if (q.uploadDateFrom) sp.set('uploadDateFrom', q.uploadDateFrom);
  if (q.uploadDateTo) sp.set('uploadDateTo', q.uploadDateTo);
  if (q.q) sp.set('q', q.q);
  if (q.page) sp.set('page', String(q.page));
  if (q.pageSize) sp.set('pageSize', String(q.pageSize));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  async upload(file: File, meta: DocumentCreate): Promise<DocumentDTO> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('metadata', JSON.stringify(meta));
    return request<DocumentDTO>('/api/documents', { method: 'POST', body: fd });
  },

  async list(q: Partial<ListQuery>) {
    return request<{ items: DocumentDTO[]; total: number; page: number; pageSize: number }>(
      `/api/documents${buildQuery(q)}`,
    );
  },

  async getById(id: string): Promise<DocumentDTO> {
    return request<DocumentDTO>(`/api/documents/${id}`);
  },

  fileUrl(id: string): string {
    return `/api/documents/${id}/file`;
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({ error: { code: 'INTERNAL', message: '' } }));
      throw new ApiClientError(body.error.code, body.error.message);
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- client/src/api.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/api.ts client/src/api.test.ts
git commit -m "feat(client): api client targets /api/documents with dual date filters"
```

---

### Task 8: Visual system — tokens.css + ShellBar + SubBar + TypeChip + App.tsx

**Files:**
- Create: `client/src/styles/tokens.css`
- Create: `client/src/components/ShellBar.tsx`
- Create: `client/src/components/SubBar.tsx`
- Create: `client/src/components/TypeChip.tsx`
- Modify: `client/src/main.tsx`
- Modify: `client/src/App.tsx`

> The visual layer is hard to unit-test meaningfully. Verify visually in the browser at the end of this task. Type-coverage and integration coverage come back in Tasks 9–11.

- [ ] **Step 1: Create `client/src/styles/tokens.css`**

```css
:root {
  --fi-bg: #f7f7f7;
  --fi-surface: #ffffff;
  --fi-line: #e5e5e5;
  --fi-ink: #32363a;
  --fi-ink-soft: #6a6d70;
  --fi-accent: #0a6ed1;
  --fi-accent-dim: #d3e8fb;
  --fi-warn: #b8540c;
  --fi-ok: #107e3e;
  --fi-radius: 4px;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--fi-bg);
  color: var(--fi-ink);
  font-family: '72', 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 14px;
}

a {
  color: var(--fi-accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}

button,
input,
select,
textarea {
  font: inherit;
  border-radius: var(--fi-radius);
  border: 1px solid var(--fi-line);
  background: var(--fi-surface);
  padding: 6px 10px;
}

button {
  background: var(--fi-surface);
  cursor: pointer;
}
button.fi-primary {
  background: var(--fi-accent);
  color: white;
  border-color: var(--fi-accent);
}
button.fi-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fi-shellbar {
  background: var(--fi-ink);
  color: white;
  padding: 0 16px;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.fi-shellbar__brand {
  font-weight: 600;
  letter-spacing: 0.3px;
}
.fi-shellbar__avatar {
  margin-left: auto;
  background: var(--fi-accent-dim);
  color: var(--fi-ink);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.fi-subbar {
  background: var(--fi-surface);
  border-bottom: 1px solid var(--fi-line);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.fi-subbar__actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.fi-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.3px;
  border: 1px solid var(--fi-line);
  background: #f2f2f2;
  color: var(--fi-ink-soft);
}
.fi-chip--accent {
  color: var(--fi-accent);
  background: #eef3f9;
  border-color: #d3e2f4;
}
.fi-chip--ok {
  color: var(--fi-ok);
  background: #f0f7ee;
  border-color: #d4e9c8;
}
.fi-chip--warn {
  color: var(--fi-warn);
  background: #fdf5e8;
  border-color: #f3dbb8;
}
.fi-chip--purple {
  color: #6f3ec2;
  background: #f4eefa;
  border-color: #dccbef;
}

.fi-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--fi-surface);
  border: 1px solid var(--fi-line);
  border-radius: var(--fi-radius);
  overflow: hidden;
}
.fi-table th {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--fi-ink-soft);
  font-weight: 600;
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--fi-line);
  background: #fafafa;
}
.fi-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--fi-line);
}
.fi-table tr:last-child td {
  border-bottom: none;
}
```

- [ ] **Step 2: Create `client/src/components/TypeChip.tsx`**

```tsx
import type { DocumentType } from '../types.js';

const TYPE_VARIANT: Record<DocumentType, string> = {
  invoice: 'fi-chip--accent',
  receipt: 'fi-chip--accent',
  quotation: 'fi-chip--accent',
  contract: 'fi-chip--ok',
  certificate: 'fi-chip--ok',
  policy: 'fi-chip--warn',
  hr_document: 'fi-chip--purple',
  meeting_minutes: '',
  report: '',
  other: '',
};

const TYPE_LABEL: Record<DocumentType, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  quotation: 'Quotation',
  contract: 'Contract',
  policy: 'Policy',
  hr_document: 'HR Document',
  meeting_minutes: 'Meeting Minutes',
  report: 'Report',
  certificate: 'Certificate',
  other: 'Other',
};

interface TypeChipProps {
  type: DocumentType;
}

export function TypeChip({ type }: TypeChipProps) {
  const variant = TYPE_VARIANT[type];
  const cls = ['fi-chip', variant].filter(Boolean).join(' ');
  return <span className={cls}>{TYPE_LABEL[type]}</span>;
}
```

- [ ] **Step 3: Create `client/src/components/ShellBar.tsx`**

```tsx
import { Link } from 'react-router-dom';

export function ShellBar() {
  return (
    <header className="fi-shellbar">
      <Link to="/" className="fi-shellbar__brand" style={{ color: 'white' }}>
        Inhouse DMS
      </Link>
      <span className="fi-shellbar__avatar" aria-hidden>
        PS
      </span>
    </header>
  );
}
```

- [ ] **Step 4: Create `client/src/components/SubBar.tsx`**

```tsx
import type { ReactNode } from 'react';

interface SubBarProps {
  title: ReactNode;
  actions?: ReactNode;
}

export function SubBar({ title, actions }: SubBarProps) {
  return (
    <div className="fi-subbar">
      <span style={{ fontWeight: 600 }}>{title}</span>
      {actions && <div className="fi-subbar__actions">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Edit `client/src/main.tsx`**

Add `import './styles/tokens.css';` after the existing imports. (The engineer should read the current file first; if `main.tsx` already imports another CSS file, add this above it.)

- [ ] **Step 6: Edit `client/src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { UploadPage } from './pages/UploadPage.js';
import { BrowsePage } from './pages/BrowsePage.js';
import { DocumentDetailPage } from './pages/DocumentDetailPage.js';
import { ShellBar } from './components/ShellBar.js';

export function App() {
  useEffect(() => {
    document.title = 'Inhouse DMS';
  }, []);

  return (
    <div>
      <ShellBar />
      <main>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
```

> `DocumentDetailPage` does not yet exist; this commit will fail compile. It lands in Task 11. Skip ahead; do not attempt to run the client until Task 11 completes.

- [ ] **Step 7: Commit**

```bash
git add client/src/styles/tokens.css client/src/components/ShellBar.tsx client/src/components/SubBar.tsx client/src/components/TypeChip.tsx client/src/main.tsx client/src/App.tsx
git commit -m "feat(client): Fiori visual system + ShellBar/SubBar/TypeChip"
```

---

### Task 9: UploadPage — conditional fields, defaults persistence, new shell

**Files:**
- Modify: `client/src/pages/UploadPage.tsx`

- [ ] **Step 1: Rewrite `client/src/pages/UploadPage.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropzone } from '../components/Dropzone.js';
import { SubBar } from '../components/SubBar.js';
import { api } from '../api.js';
import {
  CURRENCIES,
  DOCUMENT_TYPES,
  requiresFinancials,
  type DocumentCreate,
  type DocumentType,
  type Currency,
} from '../types.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

const TYPE_LABEL: Record<DocumentType, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  quotation: 'Quotation',
  contract: 'Contract',
  policy: 'Policy',
  hr_document: 'HR Document',
  meeting_minutes: 'Meeting Minutes',
  report: 'Report',
  certificate: 'Certificate',
  other: 'Other',
};

export function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    documentName: '',
    type: 'invoice' as DocumentType,
    invoiceDate: todayISO(),
    amountMajor: '',
    currency: 'THB' as Currency,
    note: '',
  });

  const showFinancials = useMemo(() => requiresFinancials(form.type), [form.type]);

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});
    if (!file) {
      setServerError('Please choose a file');
      return;
    }

    let meta: DocumentCreate;
    if (showFinancials) {
      const amountNum = Number(form.amountMajor);
      if (!Number.isFinite(amountNum) || amountNum < 0) {
        setFieldErrors({ amountMajor: 'Must be a positive number' });
        return;
      }
      meta = {
        documentName: form.documentName,
        type: form.type as 'invoice' | 'receipt',
        invoiceDate: form.invoiceDate,
        amount: Math.round(amountNum * 100),
        currency: form.currency,
        note: form.note || undefined,
      };
    } else {
      meta = {
        documentName: form.documentName,
        type: form.type as Exclude<DocumentType, 'invoice' | 'receipt'>,
        note: form.note || undefined,
      };
    }

    setSubmitting(true);
    try {
      const dto = await api.upload(file, meta);
      navigate(`/documents/${dto.id}`);
    } catch (err) {
      const e = err as { code?: string; message?: string; fields?: Record<string, string> };
      if (e.fields) setFieldErrors(e.fields);
      setServerError(e.message ?? 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SubBar title="Upload Document" />
      <form
        onSubmit={onSubmit}
        style={{
          maxWidth: 720,
          margin: '24px auto',
          padding: 16,
          background: 'var(--fi-surface)',
          border: '1px solid var(--fi-line)',
          borderRadius: 'var(--fi-radius)',
        }}
      >
        {file ? (
          <div style={{ padding: 12, background: 'var(--fi-accent-dim)', borderRadius: 'var(--fi-radius)' }}>
            Selected: <strong>{file.name}</strong>{' '}
            <button type="button" onClick={() => setFile(null)}>
              Change
            </button>
          </div>
        ) : (
          <Dropzone onFile={setFile} />
        )}

        <label htmlFor="upload-document-name">Document Name</label>
        <input
          id="upload-document-name"
          value={form.documentName}
          onChange={(e) => update('documentName', e.target.value)}
          required
          style={{ width: '100%' }}
        />
        {fieldErrors.documentName && <p style={{ color: '#c00' }}>{fieldErrors.documentName}</p>}

        <label htmlFor="upload-type">Type</label>
        <select
          id="upload-type"
          value={form.type}
          onChange={(e) => update('type', e.target.value as DocumentType)}
          style={{ width: '100%' }}
        >
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>

        {showFinancials && (
          <div className="fi-financial-group">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginTop: 12,
              }}
            >
              <div>
                <label htmlFor="upload-invoice-date">Invoice Date</label>
                <input
                  id="upload-invoice-date"
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) => update('invoiceDate', e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="upload-amount">Amount</label>
                <input
                  id="upload-amount"
                  value={form.amountMajor}
                  onChange={(e) => update('amountMajor', e.target.value)}
                  placeholder="0.00"
                  required
                />
                {fieldErrors.amountMajor && <p style={{ color: '#c00' }}>{fieldErrors.amountMajor}</p>}
              </div>
              <div>
                <label htmlFor="upload-currency">Currency</label>
                <select
                  id="upload-currency"
                  value={form.currency}
                  onChange={(e) => update('currency', e.target.value as Currency)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        <label htmlFor="upload-note">Note</label>
        <textarea
          id="upload-note"
          value={form.note}
          onChange={(e) => update('note', e.target.value)}
          rows={3}
          style={{ width: '100%' }}
        />

        {serverError && <p style={{ color: '#c00' }}>{serverError}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
          <button type="button" onClick={() => navigate('/browse')}>
            Cancel
          </button>
          <button className="fi-primary" type="submit" disabled={submitting || !file}>
            {submitting ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </>
  );
}
```

The financial state is held in `form` regardless of `type`. When the user switches to a non-financial type the financial fields are simply not rendered (state preserved). When they switch back, the values reappear; defaults (`todayISO()`, `'THB'`) are seeded at component mount, satisfying the "first time the financial group appears" rule.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/UploadPage.tsx
git commit -m "feat(client): conditional financial fields on UploadPage"
```

---

### Task 10: BrowsePage — dual date filters, table, type chips, mobile drawer

**Files:**
- Create: `client/src/components/FilterDrawer.tsx`
- Modify: `client/src/pages/BrowsePage.tsx`

- [ ] **Step 1: Create `client/src/components/FilterDrawer.tsx`**

```tsx
import { useState, type ReactNode } from 'react';

interface FilterDrawerProps {
  children: ReactNode;
}

export function FilterDrawer({ children }: FilterDrawerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open filters"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--fi-accent)',
          color: 'white',
          border: 'none',
          fontSize: 20,
          zIndex: 100,
        }}
        className="fi-drawer-trigger"
      >
        ☰
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Filters"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 200,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 280,
              maxWidth: '85vw',
              background: 'var(--fi-surface)',
              padding: 16,
              overflowY: 'auto',
            }}
          >
            <button type="button" onClick={() => setOpen(false)} aria-label="Close filters">
              ✕
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
```

The drawer trigger is `display:none` on PC via a media query — we'll add that to `tokens.css` in the next step.

- [ ] **Step 2: Append to `client/src/styles/tokens.css`**

```css
@media (min-width: 768px) {
  .fi-drawer-trigger {
    display: none !important;
  }
}
@media (max-width: 767px) {
  .fi-sidebar {
    display: none !important;
  }
  .fi-table thead {
    display: none;
  }
  .fi-table tr {
    display: block;
    padding: 8px 12px;
    border-bottom: 1px solid var(--fi-line);
  }
  .fi-table td {
    display: block;
    padding: 2px 0;
    border-bottom: none;
  }
}

label {
  display: block;
  font-size: 12px;
  color: var(--fi-ink-soft);
  margin-top: 8px;
  margin-bottom: 2px;
}
```

- [ ] **Step 3: Rewrite `client/src/pages/BrowsePage.tsx`**

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { SubBar } from '../components/SubBar.js';
import { TypeChip } from '../components/TypeChip.js';
import { FilterDrawer } from '../components/FilterDrawer.js';
import { DOCUMENT_TYPES, type DocumentDTO, type DocumentType } from '../types.js';

const TYPE_LABEL: Record<DocumentType, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  quotation: 'Quotation',
  contract: 'Contract',
  policy: 'Policy',
  hr_document: 'HR Document',
  meeting_minutes: 'Meeting Minutes',
  report: 'Report',
  certificate: 'Certificate',
  other: 'Other',
};

function FilterPanel(props: {
  q: string;
  setQ: (v: string) => void;
  type: DocumentType | '';
  setType: (v: DocumentType | '') => void;
  invoiceDateFrom: string;
  setInvoiceDateFrom: (v: string) => void;
  invoiceDateTo: string;
  setInvoiceDateTo: (v: string) => void;
  uploadDateFrom: string;
  setUploadDateFrom: (v: string) => void;
  uploadDateTo: string;
  setUploadDateTo: (v: string) => void;
}): ReactNode {
  return (
    <>
      <label htmlFor="filter-search">Search</label>
      <input id="filter-search" value={props.q} onChange={(e) => props.setQ(e.target.value)} style={{ width: '100%' }} />

      <label htmlFor="filter-type">Type</label>
      <select
        id="filter-type"
        value={props.type}
        onChange={(e) => props.setType(e.target.value as DocumentType | '')}
        style={{ width: '100%' }}
      >
        <option value="">All</option>
        {DOCUMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </select>

      <label htmlFor="filter-invoice-from">Invoice Date from</label>
      <input
        id="filter-invoice-from"
        type="date"
        value={props.invoiceDateFrom}
        onChange={(e) => props.setInvoiceDateFrom(e.target.value)}
        style={{ width: '100%' }}
      />
      <label htmlFor="filter-invoice-to">Invoice Date to</label>
      <input
        id="filter-invoice-to"
        type="date"
        value={props.invoiceDateTo}
        onChange={(e) => props.setInvoiceDateTo(e.target.value)}
        style={{ width: '100%' }}
      />

      <label htmlFor="filter-upload-from">Upload Date from</label>
      <input
        id="filter-upload-from"
        type="date"
        value={props.uploadDateFrom}
        onChange={(e) => props.setUploadDateFrom(e.target.value)}
        style={{ width: '100%' }}
      />
      <label htmlFor="filter-upload-to">Upload Date to</label>
      <input
        id="filter-upload-to"
        type="date"
        value={props.uploadDateTo}
        onChange={(e) => props.setUploadDateTo(e.target.value)}
        style={{ width: '100%' }}
      />
    </>
  );
}

export function BrowsePage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<DocumentType | ''>('');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [uploadDateFrom, setUploadDateFrom] = useState('');
  const [uploadDateTo, setUploadDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [items, setItems] = useState<DocumentDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .list({
        q: q || undefined,
        type: type || undefined,
        invoiceDateFrom: invoiceDateFrom || undefined,
        invoiceDateTo: invoiceDateTo || undefined,
        uploadDateFrom: uploadDateFrom || undefined,
        uploadDateTo: uploadDateTo || undefined,
        page,
        pageSize,
      })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as { message: string }).message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, type, invoiceDateFrom, invoiceDateTo, uploadDateFrom, uploadDateTo, page]);

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const filterProps = {
    q,
    setQ: (v: string) => {
      setQ(v);
      setPage(1);
    },
    type,
    setType: (v: DocumentType | '') => {
      setType(v);
      setPage(1);
    },
    invoiceDateFrom,
    setInvoiceDateFrom: (v: string) => {
      setInvoiceDateFrom(v);
      setPage(1);
    },
    invoiceDateTo,
    setInvoiceDateTo: (v: string) => {
      setInvoiceDateTo(v);
      setPage(1);
    },
    uploadDateFrom,
    setUploadDateFrom: (v: string) => {
      setUploadDateFrom(v);
      setPage(1);
    },
    uploadDateTo,
    setUploadDateTo: (v: string) => {
      setUploadDateTo(v);
      setPage(1);
    },
  };

  return (
    <>
      <SubBar
        title="Browse Documents"
        actions={
          <Link to="/" className="fi-primary" style={{ padding: '6px 12px', borderRadius: 'var(--fi-radius)', color: 'white', background: 'var(--fi-accent)' }}>
            + Upload
          </Link>
        }
      />
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
        <aside className="fi-sidebar" style={{ background: 'var(--fi-surface)', border: '1px solid var(--fi-line)', borderRadius: 'var(--fi-radius)', padding: 12 }}>
          <h3 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', color: 'var(--fi-ink-soft)' }}>
            Filter
          </h3>
          <FilterPanel {...filterProps} />
        </aside>
        <FilterDrawer>
          <FilterPanel {...filterProps} />
        </FilterDrawer>
        <section>
          <h3 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', color: 'var(--fi-ink-soft)' }}>
            Documents ({total})
          </h3>
          {loading && <p>Loading…</p>}
          {error && <p style={{ color: '#c00' }}>{error}</p>}
          {!loading && items.length === 0 && (
            <p>
              No documents yet. <Link to="/">Upload one</Link>.
            </p>
          )}
          <table className="fi-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Invoice Date</th>
                <th>Upload Date</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>{d.documentName}</td>
                  <td>
                    <TypeChip type={d.type} />
                  </td>
                  <td>{d.invoiceDate ?? '—'}</td>
                  <td>{d.documentDate}</td>
                  <td style={{ textAlign: 'right' }}>
                    {d.amount != null && d.currency
                      ? `${(d.amount / 100).toFixed(2)} ${d.currency}`
                      : '—'}
                  </td>
                  <td>
                    <Link to={`/documents/${d.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </button>
            <span>
              Page {page} / {lastPage}
            </span>
            <button disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/FilterDrawer.tsx client/src/styles/tokens.css client/src/pages/BrowsePage.tsx
git commit -m "feat(client): BrowsePage with dual date filters and Fiori table"
```

---

### Task 11: DocumentDetailPage — rename + conditional financial rows

**Files:**
- Create: `client/src/pages/DocumentDetailPage.tsx`
- Delete: `client/src/pages/ReceiptDetailPage.tsx`

- [ ] **Step 1: Create `client/src/pages/DocumentDetailPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { SubBar } from '../components/SubBar.js';
import { TypeChip } from '../components/TypeChip.js';
import { requiresFinancials, type DocumentDTO } from '../types.js';

export function DocumentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [dto, setDto] = useState<DocumentDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getById(id)
      .then((d) => !cancelled && setDto(d))
      .catch((e) => !cancelled && setError((e as { message: string }).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onDelete() {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      await api.remove(id);
      navigate('/browse');
    } catch (e) {
      setError((e as { message: string }).message);
    }
  }

  if (loading) return <p style={{ padding: 16 }}>Loading…</p>;
  if (error)
    return (
      <p style={{ padding: 16, color: '#c00' }}>
        {error} (<Link to="/browse">back</Link>)
      </p>
    );
  if (!dto) return null;

  const showFinancials = requiresFinancials(dto.type);

  return (
    <>
      <SubBar
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Link to="/browse">Browse</Link>
            <span>/</span>
            <span>{dto.documentName}</span>
          </span>
        }
      />
      <div
        style={{
          padding: 16,
          maxWidth: 720,
          margin: '24px auto',
          background: 'var(--fi-surface)',
          border: '1px solid var(--fi-line)',
          borderRadius: 'var(--fi-radius)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          {dto.documentName} <TypeChip type={dto.type} />
        </h2>
        <dl>
          <dt>Type</dt>
          <dd>{dto.type}</dd>
          <dt>Document Date</dt>
          <dd>{dto.documentDate}</dd>
          {showFinancials && (
            <>
              <dt>Invoice Date</dt>
              <dd>{dto.invoiceDate}</dd>
              <dt>Amount</dt>
              <dd>
                {dto.amount != null && dto.currency
                  ? `${(dto.amount / 100).toFixed(2)} ${dto.currency}`
                  : '—'}
              </dd>
            </>
          )}
          {dto.note && (
            <>
              <dt>Note</dt>
              <dd>{dto.note}</dd>
            </>
          )}
          <dt>Original file</dt>
          <dd>
            {dto.originalName} ({Math.round(dto.sizeBytes / 1024)} KB)
          </dd>
          <dt>Uploaded</dt>
          <dd>{new Date(dto.createdAt).toLocaleString()}</dd>
        </dl>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href={api.fileUrl(dto.id)}>Download original</a>
          <button onClick={onDelete} style={{ color: '#c00' }}>
            Delete
          </button>
          <Link to="/browse">Back to list</Link>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Delete the old detail page**

```bash
git rm client/src/pages/ReceiptDetailPage.tsx
```

- [ ] **Step 3: Run the full client suite + typecheck**

```
npm test -- client/
npx tsc -p tsconfig.client.json --noEmit
```
Expected: PASS, clean.

- [ ] **Step 4: Verify in browser**

```
npm run dev
```
Visit `http://localhost:5173` and exercise:
- Upload an invoice → financial fields visible, defaults today + THB. After submit, redirected to `/documents/:id` with all financial rows shown.
- Upload a contract → financial fields hidden. After submit, detail page omits invoice/amount rows; `Document Date` row visible.
- Browse: confirm both date filter pairs work; type chips render with color mapping; mobile width (<768px) shows the gear button and collapses the side panel.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/DocumentDetailPage.tsx
git commit -m "feat(client): DocumentDetailPage with conditional financial rows"
```

---

### Task 12: E2E + rebrand cleanup

**Files:**
- Modify: `e2e/golden-path.spec.ts`
- Modify: `e2e/filter.spec.ts`
- Modify: `e2e/search.spec.ts`
- Modify: `e2e/delete.spec.ts`
- Create: `e2e/golden-path-contract.spec.ts`
- Modify: `README.md`
- Modify: `package.json` (description only)

- [ ] **Step 1: Update existing E2E specs**

For each of `golden-path.spec.ts`, `filter.spec.ts`, `search.spec.ts`, `delete.spec.ts`, the engineer should:

1. Replace any path references from `/receipts/` to `/documents/` in `goto()` / detail navigation.
2. Confirm `getByLabel('Invoice Date')` still matches — it does, since the upload form keeps that label for financial types.
3. Update assertions referencing `Receipts (N)` heading text to `Documents (N)`.
4. Update the `Upload to NAS` button name to `Upload` (matches Task 9).

For `golden-path.spec.ts` specifically:

```typescript
import { test, expect } from './test-helpers';
import path from 'node:path';

test('upload → browse → detail → download (invoice)', async ({ page }) => {
  await page.goto('/');

  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));

  await page.getByLabel('Document Name').fill('E2E Test Doc');
  await page.getByLabel('Invoice Date').fill('2026-04-15');
  await page.getByLabel('Amount').fill('199.99');

  await page.getByRole('button', { name: /^Upload$/ }).click();

  await expect(page.locator('h2', { hasText: 'E2E Test Doc' })).toBeVisible();
  await expect(page.locator('text=199.99 THB')).toBeVisible();

  await page.goto('/browse');
  await expect(page.locator('text=E2E Test Doc')).toBeVisible();

  const detailLink = page.getByRole('link', { name: 'View' });
  await detailLink.click();
  const dl = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download original/ }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/sample\.pdf/);
});
```

- [ ] **Step 2: Create `e2e/golden-path-contract.spec.ts`**

```typescript
import { test, expect } from './test-helpers';
import path from 'node:path';

test('contract upload hides financial fields and detail page omits them', async ({ page }) => {
  await page.goto('/');

  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));

  await page.getByLabel('Document Name').fill('NDA Acme');
  await page.getByLabel('Type').selectOption('contract');

  await expect(page.getByLabel('Invoice Date')).toBeHidden();
  await expect(page.getByLabel('Amount')).toBeHidden();
  await expect(page.getByLabel('Currency')).toBeHidden();

  await page.getByRole('button', { name: /^Upload$/ }).click();

  await expect(page.locator('h2', { hasText: 'NDA Acme' })).toBeVisible();
  await expect(page.locator('dt', { hasText: 'Document Date' })).toBeVisible();
  await expect(page.locator('dt', { hasText: 'Invoice Date' })).toHaveCount(0);
  await expect(page.locator('dt', { hasText: 'Amount' })).toHaveCount(0);
});
```

- [ ] **Step 3: Update `README.md` and `package.json` description**

In `README.md`, replace any mentions of "Receipts" / "receipt-management" with "Inhouse DMS" / "Inhouse Document Management". Keep file paths in code samples accurate post-rename.

In `package.json`, update `description` to `"Inhouse DMS — internal document management for a small company"`. Leave `name` unchanged (`inhouse-document-management`).

- [ ] **Step 4: Run the full test stack**

```
npm test
npx playwright test
npx tsc -p tsconfig.server.json --noEmit
npx tsc -p tsconfig.client.json --noEmit
```
Expected: all PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add e2e/ README.md package.json
git commit -m "feat: rebrand to Inhouse DMS and add contract E2E path"
```

---

## Self-review checklist (run before declaring the plan done)

- [ ] **Spec coverage:** every section of `docs/superpowers/specs/2026-05-16-inhouse-dms-phase1-design.md` has a corresponding task:
  - §1 Naming/schema → Tasks 1, 2 (and rebrand in 12).
  - §2 API surface → Tasks 2, 5, 7.
  - §3 Upload form → Task 9.
  - §4 Visual system → Tasks 8, 10, 11.
  - §5 Migration + test plan → Tasks 1, 3, 4, 5, 12.
  - File-level inventory → covered by file map at top of plan.
- [ ] **Field/identifier consistency across tasks:**
  - `DocumentCreateSchema`, `DocumentDTOSchema`, `ListQuerySchema`, `requiresFinancials`, `REQUIRES_FINANCIALS`, `DOCUMENT_TYPES` — defined Task 2, used identically in Tasks 4, 5, 7, 9, 10, 11.
  - `createDocumentsRepo`, `documentsRouter` — defined Tasks 4, 5; consumed Task 6.
  - File-store `createdAt` parameter — defined Task 3, used Task 5.
  - DB columns: `document_date`, `invoice_date` (nullable) — defined Task 1, used by repo (Task 4) and route (Task 5).
- [ ] **Placeholder scan:** no `TBD`, `TODO`, "implement later", "add appropriate error handling", "similar to Task N", or unimplemented references.
- [ ] **TDD discipline:** each implementation task has explicit failing-test, implementation, passing-test, commit steps.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-16-inhouse-dms-phase1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
