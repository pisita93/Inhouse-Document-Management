# Inhouse DMS — Phase 2 Organization Design

**Date:** 2026-05-19 (decisions locked 2026-05-21)
**Phase:** 2 of 4 (Organization)
**Status:** Approved — ready for implementation plan

## Goal

Make the document library findable as it grows past a few hundred items by adding **tags**, **categories**, and **user-configurable document types**. Today the only organizing axes are `type` (a 10-value enum hard-coded in `CHECK`) and full-text search over `document_name + note`.

Phase 2 introduces user-managed metadata so a small admin group can curate the taxonomy without code changes.

## Out of scope (explicit)

- **Editing document metadata after upload** (Phase 3). Mis-tagged docs are deleted and re-uploaded in Phase 2.
- Versioning / file replacement (Phase 3).
- Users, login, per-category permissions (Phase 4). The Settings page is open to anyone on the LAN.
- Hierarchical / nested categories. Flat list; revisit if real demand emerges.
- Many-categories-per-doc. **One category per document.** Tags cover the overlap case.
- Multi-tag filter with AND/OR semantics (single tag in Phase 2).
- Smart auto-tagging / OCR / AI suggestions.
- Per-user favourites or saved filters.
- Bulk admin operations (bulk-disable, bulk-rename, etc.).
- Concurrent-admin contention handling (no auth yet).
- Migration rollback. Once 004 is committed, downgrade requires a backup restore.

## Resolved decisions

| #   | Question                        | Decision                                                                                                   |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Category cardinality            | One per doc, nullable FK on `documents`                                                                    |
| 2   | Disable a type/category         | Keep existing references; hide from new uploads                                                            |
| 3   | `requires_financial` mutability | Set at type creation, read-only after                                                                      |
| 4   | Tag input UX                    | Free-typed chips + server-side autocomplete; server normalizes (trim + lowercase) and creates on first use |
| 5   | `CHECK`-constraint removal      | Single atomic `004_document_types.sql` — full `documents` table rebuild inside a transaction               |
| 6   | FTS ranking                     | Equal weight; add `tag_names` and `category_name` columns to `documents_fts`                               |

## User-visible features

### Tags

- Free-form labels attached to a document. Many-to-many.
- Set at upload time. (Editing after upload is Phase 3.)
- Browse filter: single tag, exact match. Multi-tag with AND/OR deferred.
- Upload form: chip input with server-backed autocomplete (`GET /api/tags?q=`).
- Normalization: server lowercases, trims, and dedupes. Regex: `^[a-z0-9][a-z0-9 _-]*$`, max 40 chars, max 20 per document.

### Categories

- Single optional category per document. Flat (no nesting).
- Admin-managed list (e.g. "Finance", "HR", "Legal", "Operations").
- Browse filter: single-category dropdown alongside the existing Type filter, using the same Apply/Reset draft pattern.

### Configurable document types

- The 10-value `type` enum moves out of `CHECK(type IN (...))` into a `document_types` table.
- Existing 10 values seeded at migration time; admins can add new types or disable existing ones.
- Disabling a type hides it from the upload form only — existing documents keep their type and remain browseable/filterable.
- The financial-trio rule (`invoice_date` + `amount` + `currency` required) is driven by `document_types.requires_financial` instead of a hard-coded `type === 'invoice' || type === 'receipt'` check.
- `requires_financial` is set when the type is created and **immutable** thereafter. The `PATCH` endpoint rejects the field with 400 `REQUIRES_FINANCIAL_IMMUTABLE`.
- `document_types` is append-only: no delete, only disable. Existing FKs prevent deletion anyway.

### Settings / admin page

- New `/settings` route reachable from the ShellBar (alongside Browse/Upload).
- Three tabs: **Tags**, **Categories**, **Document Types**.
- Supports add / rename / disable (and delete for Tags and Categories only).
- Header reads "Settings (Admin)" — purely cosmetic until Phase 4 adds real gating.

## Schema impact

### New tables

```sql
CREATE TABLE document_types (
  id                  TEXT PRIMARY KEY,        -- snake_case, e.g. 'invoice'
  label               TEXT NOT NULL,           -- display, e.g. 'Invoice'
  requires_financial  INTEGER NOT NULL DEFAULT 0 CHECK(requires_financial IN (0,1)),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  disabled_at         TEXT,                    -- nullable; non-null = hidden from new uploads
  created_at          TEXT NOT NULL
);

CREATE TABLE categories (
  id           TEXT PRIMARY KEY,               -- UUID
  name         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  disabled_at  TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE tags (
  id          TEXT PRIMARY KEY,                -- UUID
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- lowercased + trimmed by server
  created_at  TEXT NOT NULL
);

CREATE TABLE document_tags (
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id       TEXT NOT NULL REFERENCES tags(id)      ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);
CREATE INDEX idx_document_tags_tag ON document_tags(tag_id);
```

### Changes to `documents` (via table rebuild)

- Drop `CHECK(type IN (...))` on `type`.
- Add `category_id TEXT REFERENCES categories(id) ON DELETE SET NULL` (nullable).
- `type` becomes `TEXT NOT NULL REFERENCES document_types(id)`.

### FTS5 reshape

Switch to a **contentless** FTS table so we can index joined values (tag names, category name) that don't live on `documents`:

```sql
CREATE VIRTUAL TABLE documents_fts USING fts5(
  document_name, note, short_note, tag_names, category_name,
  content=''
);
```

Triggers cover all three sources of change:

- INSERT / UPDATE / DELETE on `documents` (UPDATE trigger is new — currently missing).
- INSERT / DELETE on `document_tags` (regenerate `tag_names` for the affected document).
- UPDATE on `categories.name` (regenerate `category_name` for every document in that category).

Subqueries inside the triggers stitch tag/category names back together at write time.

### Why these shapes

- `document_types.id` is `TEXT` (snake_case) so existing `documents.type = 'invoice'` data flows through the FK unchanged — no value rewrites in the rebuild.
- `tags.name UNIQUE COLLATE NOCASE` enforces dedupe at the DB level even though the server also lowercases.
- Categories get a UUID id (not a slug) because their names are human-edited at runtime; slugs would drift from labels.
- `disabled_at` (timestamp, not boolean) records when and gives a free audit trail.

## Migration plan (`004_document_types.sql`)

One atomic file, runs inside the existing `runMigrations` transaction wrapper.

**Steps:**

1. Create `document_types`, `categories`, `tags`, `document_tags`.
2. Seed `document_types` with the current 10 enum values. `requires_financial = 1` for `invoice` and `receipt`; `0` for the rest.
3. Drop existing FTS table and triggers (will be recreated with new shape).
4. Rebuild `documents`:
   - `CREATE TABLE documents_new` without the `CHECK`, with `category_id` and FK on `type`.
   - `INSERT INTO documents_new SELECT ..., NULL AS category_id, ... FROM documents`.
   - `DROP TABLE documents`.
   - `ALTER TABLE documents_new RENAME TO documents`.
5. Recreate indexes (including new `idx_documents_category`).
6. Recreate contentless FTS table and triggers covering documents + document_tags + categories.

**Required runtime change:**

`PRAGMA foreign_keys = ON` must be set in `connection.ts` before `runMigrations` runs. `better-sqlite3` defaults FK enforcement OFF; the rebuild needs it ON so `documents.type` → `document_types.id` is validated at commit time. Adding it now also helps with cascade deletes on tags.

**Ledger compatibility:**

The existing `ensureLedger` auto-seed (from `378b60e`) covers 001–003. It does not know about 004, which is correct — any DB with the current schema sees 004 as unapplied and runs it cleanly.

## API surface

### New resources

| Method   | Path                      | Notes                                                                                                                           |
| -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/tags`               | `?q=` for autocomplete (case-insensitive `LIKE`)                                                                                |
| `POST`   | `/api/tags`               | Admin: explicit create (idempotent on name)                                                                                     |
| `PATCH`  | `/api/tags/:id`           | Rename                                                                                                                          |
| `DELETE` | `/api/tags/:id`           | Cascades via FK                                                                                                                 |
| `GET`    | `/api/categories`         | `?includeDisabled=true` for admin tab                                                                                           |
| `POST`   | `/api/categories`         |                                                                                                                                 |
| `PATCH`  | `/api/categories/:id`     | Rename, reorder, toggle `disabled_at`                                                                                           |
| `DELETE` | `/api/categories/:id`     | `documents.category_id` → NULL via FK                                                                                           |
| `GET`    | `/api/document-types`     | `?includeDisabled=true` for admin tab                                                                                           |
| `POST`   | `/api/document-types`     | `requires_financial` settable here, locked after                                                                                |
| `PATCH`  | `/api/document-types/:id` | Rename, reorder, toggle `disabled_at`. **Rejects body containing `requires_financial`** with 400 `REQUIRES_FINANCIAL_IMMUTABLE` |

No `DELETE` on `document_types` (FKs from `documents` would block it anyway).

### Changes to existing endpoints

`POST /api/documents` (upload):

- Body gains `categoryId?: string | null` and `tagNames?: string[]` (note: _names_, not IDs).
- Server normalizes tag names, runs `INSERT OR IGNORE INTO tags`, then writes `document_tags`. All inside the same transaction as the document insert.
- Validation tied to type's `requires_financial`:
  - `1` → `invoice_date`, `amount`, `currency` required (else 400 `FINANCIAL_FIELDS_REQUIRED`).
  - `0` → optional; nulled if absent.
- Disabled or unknown `categoryId` → 400 `UNKNOWN_OR_DISABLED_CATEGORY`.
- Disabled or unknown `type` → 400 `UNKNOWN_OR_DISABLED_TYPE`.

`GET /api/documents` (list):

- New filter params: `categoryId?`, `tagId?` (single, AND with existing filters).
- Response items include `category: { id, name } | null` and `tags: { id, name }[]`.

`GET /api/documents/:id` (detail) — same shape as list items.

### Error envelope

Unchanged from Phase 1: `{ error: { code, message, fields? } }` (see `shared/schemas.ts:ErrorEnvelopeSchema`). New error codes added by Phase 2 (uppercase per existing convention): `UNKNOWN_OR_DISABLED_TYPE`, `UNKNOWN_OR_DISABLED_CATEGORY`, `FINANCIAL_FIELDS_REQUIRED`, `REQUIRES_FINANCIAL_IMMUTABLE`, `NAME_TAKEN`.

## UI

### Upload form

```
┌─ Document Name ──────────────────────────────────────┐
├─ Type [select] ─── Category [select, optional] ──────┤
├─ Tags [chip input with autocomplete] ────────────────┤
├─ Document Date ──────────────────────────────────────┤
├─ (financial trio — visible only if type.requires_financial)
│    Invoice Date · Amount · Currency                  │
├─ Note  [textarea] ───────────────────────────────────┤
├─ Short Note [text, max 60] ──────────────────────────┤
└─ File · Submit ──────────────────────────────────────┘
```

- Type dropdown fetches `/api/document-types` (enabled only); on change, the financial trio appears/disappears based on `requires_financial`.
- Category dropdown fetches `/api/categories` (enabled only). Empty option = "(none)".
- Tag chip input: debounced 200ms, calls `/api/tags?q=`. Enter accepts highlighted suggestion or creates a new chip. Backspace on empty input deletes the previous chip. Pill chips with × to remove.

### Browse page

Filter panel extends the existing Apply/Reset draft pattern with:

- Category dropdown (includes "(any)").
- Single-tag selector (chip-style).

List rows gain:

- Small category badge after the type chip.
- Up to 3 tag chips inline, with "+N" when there are more.

### Settings page

New route `/settings`, three tabs:

- **Tags** — name, usage count (`COUNT(*) FROM document_tags WHERE tag_id = ?`), rename, delete.
- **Categories** — name, sort order, disabled toggle, delete.
- **Document Types** — id (read-only), label (editable), `requires_financial` (read-only checkbox with locked icon and "Set at creation" tooltip on existing rows; unlocked on the "+ New" form), sort order, disabled toggle. **No delete.**

Single "+ New" button per tab opens an inline modal.

## Validation & error handling

### Zod schemas

```ts
const TagNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9 _-]*$/, 'letters, digits, space, _, - only');

const CategoryNameSchema = z.string().trim().min(1).max(60);

const DocumentTypeIdSchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'snake_case');
const DocumentTypeLabelSchema = z.string().trim().min(1).max(60);

const UploadSchema = z.object({
  // ... existing fields
  categoryId: z.string().uuid().nullish(),
  tagNames: z.array(TagNameSchema).max(20).optional(),
});
```

### Server-side semantic checks

Run inside the upload transaction:

1. `type` exists and is enabled → else 400 `UNKNOWN_OR_DISABLED_TYPE`.
2. `categoryId` (if present) exists and is enabled → else 400 `UNKNOWN_OR_DISABLED_CATEGORY`.
3. Look up `requires_financial`:
   - `1` → require trio (else 400 `FINANCIAL_FIELDS_REQUIRED`).
   - `0` → optional; null out absent fields.
4. Tag upsert: for each normalized name, `INSERT OR IGNORE INTO tags`, `SELECT id`, insert `document_tags`. Failure rolls back the whole upload.

### Admin checks

- `PATCH /document-types/:id` with `requires_financial` in body → 400 `REQUIRES_FINANCIAL_IMMUTABLE`.
- Rename conflict (case-insensitive) → 409 `NAME_TAKEN`.
- Disable/enable returns the updated row.
- Delete tag with usage → cascades via FK.
- Delete category with usage → `category_id` becomes NULL via FK.

### Logging

Every admin mutation (`POST/PATCH/DELETE` on tags/categories/document-types) logs at `info` with `{ action, entityId, before?, after }`. No new table; the `_migrations` ledger gives us schema history, this gives us admin history.

## Test plan

### Migration

- `004` against fresh schema: 10 `document_types` seeded, `documents` has `category_id`, no `CHECK`, FTS shape matches.
- `004` against Phase-1 data: rows in all 10 type values preserved, FKs resolve.
- Idempotency: re-running 004 via the ledger is a no-op.
- Ledger drift test extended to cover `document_types` already existing.

### Repo

- `documentsRepo.test.ts` extended:
  - Upload with tags creates tag rows (lowercased, deduped) + `document_tags` links in one transaction; forced failure rolls back.
  - Upload with disabled `categoryId` rejected.
  - Upload with `requires_financial=1` type missing trio rejected.
  - Upload with `requires_financial=0` type accepts missing trio.
  - List with `categoryId` / `tagId` filters returns expected docs.
  - List response includes `category` and `tags`.
- New: `tagsRepo.test.ts` — case-insensitive dedupe, rename, delete cascade, autocomplete.
- New: `categoriesRepo.test.ts` — CRUD + disable + delete-sets-FK-null + name uniqueness.
- New: `documentTypesRepo.test.ts` — create with `requires_financial`, rename, disable, `requires_financial` immutable on update.

### FTS

- Search hits each column independently (`document_name`, `note`, `short_note`, `tag_names`, `category_name`).
- Adding/removing a tag updates the FTS index.
- Renaming a category updates the FTS index for every document in that category.

### Routes

- New: `tags.test.ts`, `categories.test.ts`, `documentTypes.test.ts` — happy path + each validation error code.
- `documents.test.ts` extended with new filter params and response shape.

### E2E (Playwright)

- Upload with new category + 3 tags → appears on browse with badges.
- Browse filter by category → list shrinks; Apply/Reset works.
- Settings: create/rename/delete a tag; create/disable a category and verify it's hidden from upload.
- Create new type with `requires_financial=true`; verify the trio appears on upload; verify `PATCH` cannot flip the flag.

### Explicitly NOT tested

- Concurrent admin edits (no auth/contention model in Phase 2).
- Migration performance on large DBs (current data is small).
- Tag normalization edge cases beyond ASCII + space + `_-` (the regex is the contract).

## Risks / dependencies

- The 004 rebuild is the largest schema change in the project. Mitigations: atomic transaction, idempotent via ledger, snapshot-style row-count assertion in tests.
- `PRAGMA foreign_keys = ON` change in `connection.ts` is small but affects every connection. Verify all existing tests still pass before shipping.
- Phase 3 (edit) depends on Phase 2 schema being final. Re-renaming columns later means another heavy migration.
- The Settings page begins to create "admin" surface area that Phase 4 will harden with real permissions. Keep its scope tight until then.

## Suggested task ordering for the implementation plan

1. `connection.ts` PRAGMA foreign_keys = ON (1-line change + test fixture verification).
2. `004_document_types.sql` migration + migration tests (highest schema risk, ship first).
3. `document_types` repo + routes + admin UI tab.
4. `categories` repo + routes + admin UI tab + upload form integration.
5. `tags` repo + routes + admin UI tab + upload form integration (chip input).
6. Browse filter extensions (category dropdown + tag selector).
7. FTS trigger updates so tag/category names are searchable.
8. E2E coverage end-to-end.

---

## Implementation status

Shipped on `main` via commits `fcad4d3..ca5a005` (Tasks 1 through 15), closed
out by the docs commit that introduces this footer (Task 16).
