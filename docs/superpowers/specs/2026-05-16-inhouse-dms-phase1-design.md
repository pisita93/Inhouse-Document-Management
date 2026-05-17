# Inhouse DMS — Phase 1 Foundation Design

**Date:** 2026-05-16
**Phase:** 1 of 4 (Foundation)
**Status:** Approved — ready for implementation plan

## Goal

Evolve the existing receipt-management app into a general "Inhouse DMS" by:

1. Rebranding to **Inhouse DMS**.
2. Broadening the document type taxonomy from 4 to 10 values.
3. Making financial metadata (date, amount, currency) **conditionally required**: mandatory for `invoice` and `receipt`, hidden for everything else.
4. Replacing the current ad-hoc UI with a Fiori-inspired professional look that works on PC browsers and mobile browsers.

Subsequent phases (out of scope here) will add categories/tags, edit/versioning, and users/auth.

## Decisions confirmed during brainstorming

| Decision | Choice |
|---|---|
| UI direction | SAP Fiori as inspiration only — no UI5 framework. Keep React + Vite. |
| Document type set | Hard-coded enum of 10 values. Configurable types defer to Phase 2. |
| Form behavior for non-financial types | Hide financial fields entirely. |
| Rename scope | Full rename of DB table, API routes, and code (`receipts` → `documents`). No backward-compat alias. |
| Date columns | Two columns: `document_date` is server-set to the upload date (YYYY-MM-DD, NOT NULL, every row); `invoice_date` is user-entered, nullable, required for `invoice` / `receipt` only. Both indexed. |
| File-store path | Derived from `createdAt` (upload time) year/month. Same layout for every type. |

## Out of scope (explicit)

- Categories, folders, tags (Phase 2)
- Edit metadata, versioning, revisions (Phase 3)
- Users, login, permissions, audit (Phase 4)
- Bulk actions, CSV/XLSX export, OCR auto-fill
- New currencies beyond `THB / USD / EUR / JPY / CNY`
- Dark mode, per-user themes
- Migration registry table (separate cleanup task)

---

## 1. Naming & schema

### App name

- Display "Inhouse DMS" everywhere: browser title, ShellBar, README, `package.json#description`.
- `package.json#name` stays `inhouse-document-management` (already aligned).

### Document type enum

Stored snake_case in DB, presented title-cased in UI:

`invoice`, `receipt`, `quotation`, `contract`, `policy`, `hr_document`, `meeting_minutes`, `report`, `certificate`, `other`.

### Database column changes

| Old (`receipts`) | New (`documents`) | Notes |
|---|---|---|
| `invoice_date` (TEXT NOT NULL) | `invoice_date` (TEXT, nullable) | Same column name; meaning narrowed to "financial document date". Required for `invoice` / `receipt`, NULL otherwise. |
| — (new) | `document_date` (TEXT NOT NULL) | **New column.** Server-set to today's `YYYY-MM-DD` on insert. Represents the upload date. Backfilled on migration from `substr(created_at, 1, 10)`. |
| `amount` (INTEGER NOT NULL) | `amount` (INTEGER, nullable) | Only `invoice` / `receipt` populate it. |
| `currency` (TEXT NOT NULL) | `currency` (TEXT, nullable) | Same. |
| `type` CHECK in 4 values | `type` CHECK in 10 values | New enum. |
| `created_at` | unchanged | Full ISO timestamp; retained for sort tiebreaker and audit. |

### Column semantics

- **`document_date`** — system field, set by the server at upload. Always populated. Drives the "upload date" filter.
- **`invoice_date`** — user field, only meaningful for `invoice` / `receipt`. NULL for all other types. Drives the "invoice date" filter used in financial reporting.
- **`created_at`** — full ISO-8601 timestamp. Audit-only and used as a secondary sort key.

### Where the conditional rule lives

Enforced in the **API layer** (zod discriminated union), **not** in the DB. The DB allows any combination of nulls for the financial trio (`invoice_date`, `amount`, `currency`), so Phase 2+ changes to the rule don't require another schema migration. `document_date` is unconditional and never user-supplied.

---

## 2. API surface

All routes move under `/api/documents`. LAN-only app, no consumers besides our SPA, no compat alias.

| Method | Path | Behavior |
|---|---|---|
| `POST`   | `/api/documents` | Upload. Multipart: `metadata` JSON + `file`. Server sets `document_date` to today; client never sends it. |
| `GET`    | `/api/documents` | List with `q`, `type`, `invoiceDateFrom`, `invoiceDateTo`, `uploadDateFrom`, `uploadDateTo`, `page`, `pageSize`. |
| `GET`    | `/api/documents/:id` | Detail. |
| `GET`    | `/api/documents/:id/file` | Download original. |
| `DELETE` | `/api/documents/:id` | Remove. |
| `GET`    | `/api/health` | unchanged. |
| `POST`   | `/api/test/reset` | unchanged (still gated on `E2E_RESET_ENABLED`). |

### Shared zod schemas (`shared/schemas.ts`)

- `DOCUMENT_TYPES` — readonly tuple of the 10 enum values.
- `REQUIRES_FINANCIALS = new Set(['invoice', 'receipt'])` — exported for client + server to share.
- `DocumentCreateSchema` — `z.discriminatedUnion('type', [...])`:
  - `invoice` and `receipt` variants require `invoiceDate` (`YYYY-MM-DD`), `amount` (positive int, minor units), `currency` (enum of 5).
  - All other variants make those three `.optional()`.
  - **No variant includes `documentDate`** — that field is server-assigned at insert and never accepted from the client.
- `DocumentDTO` — return shape:
  - `documentDate: string` (always present, `YYYY-MM-DD`)
  - `invoiceDate: string | null`
  - `amount: number | null`
  - `currency: Currency | null`
- `ListQuerySchema`:
  - `invoiceDateFrom`, `invoiceDateTo` — filter on `invoice_date`. Rows with `NULL invoice_date` are excluded when either bound is set (so a financial-period query naturally restricts to financial docs).
  - `uploadDateFrom`, `uploadDateTo` — filter on `document_date`. Every row qualifies since `document_date` is NOT NULL.
  - All four bounds optional and independently combinable.

### File / symbol renames

| Old | New |
|---|---|
| `server/src/routes/receipts.ts` | `server/src/routes/documents.ts` |
| `server/src/db/receiptsRepo.ts` | `server/src/db/documentsRepo.ts` |
| `createReceiptsRepo` | `createDocumentsRepo` |
| `receiptsRouter` | `documentsRouter` |

`AppDeps.repo` keeps its generic field name.

### Error model

`zod.discriminatedUnion` rejection surfaces through the existing `VALIDATION` envelope in `errorHandler.ts` with field-level details (`fields.amount`, etc.). No new error code required.

### File-store path derivation

`FileStore` currently derives `<root>/<YYYY>/<MM>/<id>.<ext>` from `invoiceDate`. Because `document_date` is nullable in Phase 1 (e.g., a contract has no financial date), the date dimension switches to **`createdAt`** — every uploaded file lives under its upload year/month regardless of type. This decouples storage layout from user-entered metadata and avoids `NULL`-handling branches.

Signature change in `server/src/storage/fileStore.ts`:

| Old | New |
|---|---|
| `write(id, ext, invoiceDate, bytes)` | `write(id, ext, createdAt, bytes)` |
| `openStream(id, ext, invoiceDate)` | `openStream(id, ext, createdAt)` |
| `exists(id, ext, invoiceDate)` | `exists(id, ext, createdAt)` |
| `unlink(id, ext, invoiceDate)` | `unlink(id, ext, createdAt)` |
| `derivePath(id, ext, invoiceDate)` | `derivePath(id, ext, createdAt)` |

`createdAt` is the ISO-8601 string the route already generates; `derivePath` slices `[0..4]` for year and `[5..7]` for month — same shape as the old `YYYY-MM-DD` input, so the parsing logic is unchanged.

> **Filtering & reporting on invoice date is unaffected.** This `createdAt`-based path change only affects the *on-disk file location*. The `invoice_date` column is still stored for every `invoice` / `receipt`, still indexed (`idx_documents_invoice_date`, see §5), and still drives `GET /api/documents?invoiceDateFrom=…&invoiceDateTo=…`. Future financial reports that pivot on the invoice date keep working — only the directory layout under `DATA_DIR/file/` changed.

---

## 3. Upload form behavior

### Layout

Single column on mobile (<768px); two-column for `Invoice Date | Amount` on PC.

```
File dropzone
Document Name (required)
Type (required)
  ── if type ∈ {invoice, receipt} ──
  Invoice Date (required, default today)
  Amount (required)
  Currency (required, default THB)
  ─────────────────────────────────
Note (optional)
[Cancel] [Upload]
```

The document/upload date is never rendered as an input — it's server-assigned. It surfaces in list and detail views as a read-only field.

### Field rendering matrix

| Type | Doc Name | Invoice Date | Amount | Currency | Note |
|---|---|---|---|---|---|
| `invoice`, `receipt` | required | **required**, default today | **required** | **required**, default THB | optional |
| All 8 other types | required | hidden | hidden | hidden | optional |

### Convenience behavior

- Invoice Date defaults to today the first time the financial group appears in a given session.
- Currency defaults to THB the first time the financial group appears.
- Switching type away from `invoice` / `receipt` **keeps the in-memory financial values** but does not send them. Switching back restores those values; if nothing was ever typed, the defaults (today, THB) reapply.

### Validation

- **Client:** a shared `requiresFinancials(type)` helper reads `REQUIRES_FINANCIALS` from `shared/schemas.ts`. Controls field rendering, required asterisks, and submit-button enable state.
- **Server:** zod discriminated-union; no new code paths in `errorHandler.ts`.

### Detail page

A `contract` (or any non-financial type) does not render an `Invoice Date / Amount / Currency` row at all — same `requiresFinancials(type)` gate. The `Document Date` (upload date) row is always shown regardless of type.

---

## 4. Visual system & responsive shell

Design tokens, ShellBar, sub-bar, side filter panel, dense table. Implemented as plain React + CSS; no framework or component library.

### Color tokens

| Token | Value | Use |
|---|---|---|
| `--fi-bg` | `#f7f7f7` | App background |
| `--fi-surface` | `#ffffff` | Cards, side panel, table body |
| `--fi-line` | `#e5e5e5` | Borders, dividers |
| `--fi-ink` | `#32363a` | Primary text + ShellBar |
| `--fi-ink-soft` | `#6a6d70` | Secondary text, table headers |
| `--fi-accent` | `#0a6ed1` | Primary buttons, links, focus |
| `--fi-accent-dim` | `#d3e8fb` | Avatar pill, accent backgrounds |
| `--fi-warn` | `#b8540c` | Policy chip, validation hint |
| `--fi-ok` | `#107e3e` | Contract chip, success states |
| `--fi-radius` | `4px` | Button + input border radius |

### Type chip palette

Each document type renders as a `<span class="fi-chip ...">`. Color mapping:

| Type | Treatment |
|---|---|
| `invoice`, `receipt`, `quotation` | accent blue — `#0a6ed1` on `#eef3f9`, border `#d3e2f4` |
| `contract`, `certificate` | green — `#107e3e` on `#f0f7ee`, border `#d4e9c8` |
| `policy` | warn orange — `#b8540c` on `#fdf5e8`, border `#f3dbb8` |
| `hr_document` | purple — `#6f3ec2` on `#f4eefa`, border `#dccbef` |
| `meeting_minutes`, `report`, `other` | neutral gray — `--fi-ink-soft` on `#f2f2f2`, border `--fi-line` |

The CSS lives in `client/src/styles/tokens.css` alongside the color tokens.

### Typography

`'72', 'Segoe UI', system-ui, -apple-system, sans-serif`. The `'72'` font is SAP's UI font; not bundled — graceful fallback to Segoe UI / system-ui. Table header text: `11px` uppercase, `letter-spacing: 0.5px`. Body text: `14px`.

### Shell layout (every page)

```
┌────────────────────────────────────────────────────────────┐
│ ShellBar:  [D] Inhouse DMS  ……  [search]  [PS]             │  44px dark
├────────────────────────────────────────────────────────────┤
│ Sub-bar:   Home / Browse              [Export] [+ Upload]  │  white
├────────────────┬───────────────────────────────────────────┤
│  Filters       │  Documents card                           │
│  Search        │  ┌────────────────────────────────────┐   │
│  Type ▾        │  │ Name | Type | Date | Amount | View │   │
│  Date from     │  ├────────────────────────────────────┤   │
│  Date to       │  │  …rows…                            │   │
│                │  └────────────────────────────────────┘   │
└────────────────┴───────────────────────────────────────────┘
   240px sidebar    main content area
```

### Responsive behavior

- **Breakpoint:** `min-width: 768px` for two-column layouts.
- **<768px:** Side filter panel collapses behind a floating gear button that opens a drawer. The table collapses to a single-column list with metadata (type chip, date, amount) stacked under the document name.
- **Sub-bar actions:** `+ Upload` becomes an icon-only `+` button on mobile; `Export` hides behind an overflow menu.

### Page touchpoints

| Page | Phase 1 changes |
|---|---|
| `UploadPage` | New shell. Form field set conditionally rendered via `requiresFinancials(type)`. Inputs use the new token-based CSS. Inline error pattern preserved. |
| `BrowsePage` | New shell. Filter sidebar exposes both date pairs: "Invoice Date from/to" (financial filter) and "Upload Date from/to" (always applies). Table uses the new structure with type chips, density, and the responsive collapse rule. Type dropdown lists all 10 types. Table columns: Name, Type, Invoice Date, Upload Date, Amount, View — Invoice Date / Amount render `—` for rows where they're NULL. |
| `ReceiptDetailPage` | Renamed to `DocumentDetailPage`. Financial rows hidden for non-financial types. Download / Delete actions unchanged. |
| Global | New `client/src/App.tsx` adds the ShellBar + sub-bar wrappers around the React Router outlet. Browser tab title set via the route. |

### Why this stack

- Plain CSS + tokens means no bundle-size hit; works in the existing Vite build.
- Single stylesheet (`client/src/styles/tokens.css`) loaded once in `main.tsx`.
- Component-local styles where layout-specific (e.g., `BrowsePage.module.css` or inline as today).

---

## 5. Migration & test strategy

### Migration `migrations/002_rename_to_documents.sql`

One transaction, idempotent on a fresh DB. Sketch:

```sql
CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  document_name   TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN (
                    'invoice','receipt','quotation','contract','policy',
                    'hr_document','meeting_minutes','report','certificate','other')),
  document_date   TEXT NOT NULL,  -- server-set upload date (YYYY-MM-DD)
  invoice_date    TEXT,           -- user-entered, only for invoice/receipt
  amount          INTEGER CHECK(amount IS NULL OR amount >= 0),
  currency        TEXT    CHECK(currency IS NULL OR currency IN ('THB','USD','EUR','JPY','CNY')),
  note            TEXT,
  filename        TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at      TEXT NOT NULL
);

-- Backfill document_date from the date portion of created_at for migrated rows.
INSERT OR IGNORE INTO documents
  SELECT id, document_name, type,
         substr(created_at, 1, 10) AS document_date,
         invoice_date,
         amount, currency, note,
         filename, original_name, mime_type, size_bytes, created_at
  FROM receipts;

DROP TABLE IF EXISTS receipts_fts;
DROP TABLE IF EXISTS receipts;

CREATE INDEX IF NOT EXISTS idx_documents_document_date ON documents(document_date);
CREATE INDEX IF NOT EXISTS idx_documents_invoice_date  ON documents(invoice_date);
CREATE INDEX IF NOT EXISTS idx_documents_type          ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at    ON documents(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  document_name, note, content='documents', content_rowid='rowid');

-- Idempotent bulk populate: only runs when FTS is empty (first migration boot).
-- On subsequent boots, the AFTER INSERT trigger keeps FTS in sync, so re-running
-- this would create duplicate FTS rows and corrupt search.
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

`runMigrations()` re-runs every `.sql` file on every boot (existing pattern). The migration is idempotent because:

- `CREATE TABLE / INDEX / TRIGGER / VIRTUAL TABLE IF NOT EXISTS` are no-ops on re-run.
- `001_init.sql` always runs first and recreates `receipts` (empty) on every boot after `002` has dropped it, so the `INSERT OR IGNORE … FROM receipts` step is safe — it copies 0 rows on the second boot onward.
- `INSERT OR IGNORE` on `documents` skips any rows already migrated (PK conflict).
- The bulk FTS populate is gated on `WHERE NOT EXISTS (SELECT 1 FROM documents_fts)` so it only fires the first time. Subsequent inserts go through the `documents_ai` trigger.

### Test plan

| Layer | Changes |
|---|---|
| `shared/schemas.test.ts` | Discriminated-union cases: invoice w/ financials passes; invoice missing `amount` fails; contract w/o financials passes; contract w/ optional financials populated passes. `DocumentCreateSchema` **rejects** a client-supplied `documentDate` (or silently strips it — pick one and lock it in the test). Direct unit test for `requiresFinancials(type)`. `ListQuerySchema` accepts the four date params independently. |
| `server/test/migrations.test.ts` | Populated `receipts` → after migration `documents` has same rows; each migrated row's `document_date` equals `substr(created_at, 1, 10)`; `invoice_date` is preserved verbatim; FTS index searchable. Fresh DB → `documents` exists with 10-value CHECK constraint and both date indexes present. **Idempotency:** run migrations twice, assert FTS row count equals document row count (no duplicates). |
| `server/test/fileStore.test.ts` | `derivePath` parameter renamed to `createdAt`; path derives from upload-time year/month for both financial and non-financial types. Existing assertions update to use a `createdAt` ISO string in place of `invoiceDate`. |
| `server/test/documentsRepo.test.ts` (renamed) | All existing repo tests carry over; field names updated; `document_date` populated by repo `insert`. New tests: (a) contract with NULL `invoice_date` is excluded when an `invoiceDateFrom`/`invoiceDateTo` range is set; (b) the same contract is **included** under an `uploadDateFrom`/`uploadDateTo` range covering its upload day; (c) combining both filters narrows correctly. |
| `server/test/upload.test.ts` | Route updated. New: contract with no financial fields → 201, response `documentDate` set to today, `invoiceDate` null. Invoice missing `amount` → 400 `VALIDATION` with `fields.amount` populated. On-disk path assertions read year/month from `createdAt` instead of the (now removed) `invoice_date`. |
| `list.test.ts`, `detail-and-download.test.ts`, `delete.test.ts` | Route rename; path assertions switch to `createdAt`-derived year/month. |
| `e2e/*.spec.ts` | Labels updated (`Invoice Date` → `Document Date`). New `golden-path-contract.spec.ts`: upload contract, financial fields never rendered, detail page omits financial rows. |
| `client/src/components/Dropzone.test.tsx`, `client/src/api.test.ts` | API URL updates. |

### Coverage target

The `requiresFinancials` helper and contract-flow tests cover the conditional code paths. The 80% function-coverage threshold should hold.

---

## File-level change inventory

**New files**

- `migrations/002_rename_to_documents.sql`
- `server/src/routes/documents.ts` (replaces `routes/receipts.ts`)
- `server/src/db/documentsRepo.ts` (replaces `db/receiptsRepo.ts`)
- `client/src/styles/tokens.css`
- `client/src/components/ShellBar.tsx`
- `client/src/components/SubBar.tsx`
- `client/src/components/TypeChip.tsx`
- `client/src/components/FilterDrawer.tsx` (mobile filter drawer)
- `client/src/pages/DocumentDetailPage.tsx` (replaces `ReceiptDetailPage.tsx`)
- `e2e/golden-path-contract.spec.ts`

**Modified files**

- `shared/schemas.ts` — discriminated union, type enum expansion, `REQUIRES_FINANCIALS`, `requiresFinancials`.
- `server/src/app.ts` — route mount path.
- `server/src/index.ts` — no functional change; symbol rename.
- `server/src/storage/fileStore.ts` — rename `invoiceDate` parameter to `createdAt` on all five functions; path derivation logic unchanged.
- `client/src/main.tsx` — import tokens.css.
- `client/src/App.tsx` — wrap routes in ShellBar + SubBar.
- `client/src/pages/UploadPage.tsx` — conditional fields, new styling, document-date rename.
- `client/src/pages/BrowsePage.tsx` — new filter panel + table layout + 10-type filter dropdown.
- `client/src/api.ts` — base URL path; DTO type changes.
- `README.md` — rebrand text.
- `package.json` — description.
- All tests listed in the test plan above.

**Removed files**

- `server/src/routes/receipts.ts`
- `server/src/db/receiptsRepo.ts`
- `client/src/pages/ReceiptDetailPage.tsx`
