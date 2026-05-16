# Inhouse Document Management — Receipt Upload v1 Design

**Date:** 2026-05-14
**Status:** Approved for implementation planning
**Owner:** pisit

## 1. Purpose

A LAN-only web application for a small office to upload receipts, invoices, and quotations to a Synology NAS, with metadata stored in SQLite and a browse/filter/search UI. Default currency is THB. Documents are retained for 7 years per Thai tax record-keeping convention.

**Scope of v1:** upload, browse with filter and search, view detail, download original, delete. Nothing else.

**Out of scope for v1:** authentication, edit/update, bulk operations, thumbnails or in-browser PDF preview, vendor/project/tag taxonomies, virus scanning, rate limiting, multi-language UI, FX conversion.

## 2. Constraints and assumptions

- **Volume:** under 500 receipts per month, ~42,000 records over the 7-year retention window.
- **Users:** small office on a trusted LAN. Single shared account model — no login. Anyone who can reach the URL can upload, browse, and delete.
- **Host:** Synology NAS with Docker and Portainer Community Edition already installed.
- **Deployment:** push to GitHub `main` triggers a Portainer webhook that pulls the repo and redeploys the Docker stack. Manual click-through deploys are also available as a fallback.
- **Network:** LAN-only. No HTTPS in v1 (add nginx in front if/when public access is needed — out of scope).
- **Backups:** the NAS-level snapshot schedule covers `/volume1/docker/Document-Management`, which holds both files and the SQLite database.

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Office LAN (no auth)                          │
│                                                                       │
│   Browser (React SPA) ──▶ http://nas-host:5900                       │
│                                  │                                    │
│                                  ▼                                    │
│   ╔═══════════════════════════════════════════════════════════════╗  │
│   ║                      NAS (Docker host)                         ║  │
│   ║                                                                ║  │
│   ║   ┌─ Portainer ────────────────────────────────────────────┐  ║  │
│   ║   │  Stack: "receipts" (pulled from GitHub via Git repo)    │  ║  │
│   ║   │                                                          │  ║  │
│   ║   │   ┌─ container: receipts-app ────────────────────────┐  │  ║  │
│   ║   │   │   Node 20 + Express  (single process)            │  │  ║  │
│   ║   │   │     • serves built React SPA  (static)           │  │  ║  │
│   ║   │   │     • /api routes  (upload • list • search)      │  │  ║  │
│   ║   │   │     • SQLite (FTS5) at /data/db/receipts.db      │  │  ║  │
│   ║   │   │     • writes files to /data/file/...             │  │  ║  │
│   ║   │   │   port 5900  ←  host port 5900                   │  │  ║  │
│   ║   │   │   volume:   /data  ←  /volume1/docker/           │  │  ║  │
│   ║   │   │                       Document-Management        │  │  ║  │
│   ║   │   └──────────────────────────────────────────────────┘  │  ║  │
│   ║   └─────────────────────────────────────────────────────────┘  ║  │
│   ║                                                                ║  │
│   ║   NAS filesystem:                                              ║  │
│   ║     /volume1/docker/Document-Management/                       ║  │
│   ║       ├─ db/receipts.db   (SQLite + WAL)                       ║  │
│   ║       └─ file/{YYYY}/{MM}/{uuid}.{ext}                         ║  │
│   ╚═══════════════════════════════════════════════════════════════╝  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.1 Deployment shape

- One Node 20 process, containerized, listening on port `5900` inside the container.
- Container port `5900` maps to host port `5900`.
- Host bind-mount: `/volume1/docker/Document-Management` → `/data` inside the container.
- The built React bundle is served as static files by Express from `server/public/`.
- Portainer Git stack points at the GitHub repository's `docker-compose.yml`. A GitHub webhook posted to Portainer triggers redeploy on push to `main`.
- No HTTPS termination in v1.

### 3.2 Storage layout

Bind-mount root inside the container is `/data`:

| Path                                  | Contents                                            |
| ------------------------------------- | --------------------------------------------------- |
| `/data/db/receipts.db`                | SQLite database (with `-wal` and `-shm` siblings)   |
| `/data/file/{YYYY}/{MM}/{uuid}.{ext}` | Uploaded receipt files, partitioned by invoice date |

One folder, one snapshot unit, one thing to back up.

### 3.3 Project layout (monorepo, single `package.json`)

```
/server                Express app, routes, SQLite repo, file writer
/client                React SPA (Vite + React 18)
/shared                Zod schemas shared between client and server
/migrations            SQL files for SQLite schema
Dockerfile             multi-stage build: build client, build server, runtime
docker-compose.yml     defines the receipts service, volume, port 5900
.dockerignore
README.md              setup steps (NAS folder, Portainer stack config)
```

### 3.4 Reference `docker-compose.yml`

```yaml
services:
  receipts:
    build: .
    image: receipts-app:latest
    container_name: receipts
    restart: unless-stopped
    ports:
      - '5900:5900'
    volumes:
      - /volume1/docker/Document-Management:/data
    environment:
      - PORT=5900
      - DATA_DIR=/data
      - NODE_ENV=production
```

## 4. Components

### 4.1 Server modules

```
server/
  index.ts              boot: load env, run migrations, start listener
  app.ts                Express wiring (middleware order, routes, error handler)
  config.ts             env-var parsing via Zod, fail-fast on bad config
  db/
    connection.ts       better-sqlite3 instance, WAL mode, foreign keys ON
    migrations.ts       runs SQL files in /migrations at startup
    receiptsRepo.ts     insert, getById, list(filter+page), search(FTS5), delete
  storage/
    fileStore.ts        write to /data/file/{YYYY}/{MM}/{uuid}.{ext},
                        stream-read, delete
  routes/
    receipts.ts         all /api/receipts handlers
    health.ts           /api/health for Portainer healthcheck
  middleware/
    upload.ts           multer: PDF/JPG/PNG only, 25 MB max, memory storage
    errorHandler.ts     converts thrown errors → consistent JSON envelope
```

### 4.2 Client modules

```
client/src/
  main.tsx, App.tsx           bootstrap + react-router shell
  api.ts                      fetch wrappers, typed against shared/schemas
  pages/
    UploadPage.tsx            the wireframed upload form
    BrowsePage.tsx            list + filter sidebar + search box + pagination
    ReceiptDetailPage.tsx     metadata view + "Download original" link
  components/
    Dropzone.tsx              drag/drop + click-to-browse
    FilterBar.tsx             type select, date range, search input
    ReceiptList.tsx           paginated list
```

### 4.3 Shared schemas (Zod, imported by both sides)

```ts
// shared/schemas.ts
export const RECEIPT_TYPES = ["invoice", "receipt", "quotation", "other"] as const;
export const CURRENCIES    = ["THB", "USD", "EUR", "JPY", "CNY"] as const;

ReceiptCreate = { documentName, type, invoiceDate, amount, currency, note? }
ReceiptDTO    = ReceiptCreate + { id, filename, originalName, mimeType,
                                  sizeBytes, createdAt }
ListQuery     = { type?, dateFrom?, dateTo?, q?, page?, pageSize? }
```

## 5. API surface

| Method   | Path                     | Purpose                  | Request                                                           | Response                                                       |
| -------- | ------------------------ | ------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `POST`   | `/api/receipts`          | Upload                   | `multipart/form-data`: `file` + `metadata` (JSON)                 | `201` `ReceiptDTO`                                             |
| `GET`    | `/api/receipts`          | List + filter            | query: `type`, `dateFrom`, `dateTo`, `q`, `page=1`, `pageSize=20` | `200` `{ items, total, page, pageSize }`                       |
| `GET`    | `/api/receipts/:id`      | Metadata only            | —                                                                 | `200` `ReceiptDTO` / `404`                                     |
| `GET`    | `/api/receipts/:id/file` | Download original        | —                                                                 | `200` binary stream with `Content-Disposition` / `404` / `410` |
| `DELETE` | `/api/receipts/:id`      | Remove DB row + file     | —                                                                 | `204` / `404`                                                  |
| `GET`    | `/api/health`            | Container liveness probe | —                                                                 | `200` `{ ok: true, version }`                                  |

**Search semantics (`q`):** SQLite FTS5 virtual table indexes `document_name` + `note`. Tokenized, prefix-match, case-insensitive, ranked by BM25. Combined with `type` / `dateFrom` / `dateTo` filters using AND.

**Success responses** return the resource directly (no `data:` wrapper). **Error responses** use the envelope in §7.2.

## 6. Data flow

### 6.1 Upload — file-then-DB with rollback

1. `multer` parses multipart into memory.
2. Zod validates the `metadata` JSON.
3. `file-type` byte-sniffs the upload; rejects if the actual MIME is not PDF, JPG, or PNG (regardless of client-claimed mime).
4. Generate a UUID v4.
5. **Write the file first** to `/data/file/{YYYY}/{MM}/{uuid}.{ext}` (year/month derived from `invoiceDate`).
6. `INSERT` the DB row.
7. If the `INSERT` fails, `unlink` the file in the catch block.
8. Return `201 ReceiptDTO`.

Rationale: a DB row without a file is permanently broken. A file without a DB row is an orphan, harmless, and sweepable. Erring toward orphans is safer.

### 6.2 List / search

- If `q` is present: `JOIN receipts_fts` and order by `bm25(receipts_fts)`.
- Otherwise: straight `WHERE` and order by `invoice_date DESC`.
- Filters AND together. Pagination uses `LIMIT pageSize OFFSET (page-1)*pageSize`. A second `SELECT COUNT(*)` produces `total`.

### 6.3 Download

`SELECT filename, mime_type, original_name FROM receipts WHERE id = ?`. Stream the file from disk with `Content-Type: <mime>` and `Content-Disposition: attachment; filename="<original_name>"`. If the row exists but the file is missing on disk, return `410 FILE_GONE`.

### 6.4 Delete

`SELECT filename`, `DELETE` the row inside a transaction, then `unlink` the file. If `unlink` fails (file already gone, permission error), log at `error` level and still return `204` — the row is gone, the file is orphaned and harmless.

## 7. Database schema

```sql
-- migrations/001_init.sql
CREATE TABLE receipts (
  id              TEXT PRIMARY KEY,
  document_name   TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('invoice','receipt','quotation','other')),
  invoice_date    TEXT NOT NULL,               -- ISO 8601 date YYYY-MM-DD
  amount          INTEGER NOT NULL,            -- minor units (satang for THB, cents for others)
  currency        TEXT NOT NULL CHECK(currency IN ('THB','USD','EUR','JPY','CNY')),
  note            TEXT,
  filename        TEXT NOT NULL,               -- uuid.ext (full path is derived)
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  created_at      TEXT NOT NULL                -- ISO 8601 datetime UTC
);

CREATE INDEX idx_receipts_invoice_date ON receipts(invoice_date);
CREATE INDEX idx_receipts_type         ON receipts(type);
CREATE INDEX idx_receipts_created_at   ON receipts(created_at);

CREATE VIRTUAL TABLE receipts_fts USING fts5(
  document_name, note, content=receipts, content_rowid=rowid
);

CREATE TRIGGER receipts_ai AFTER INSERT ON receipts BEGIN
  INSERT INTO receipts_fts(rowid, document_name, note)
  VALUES (new.rowid, new.document_name, new.note);
END;

CREATE TRIGGER receipts_ad AFTER DELETE ON receipts BEGIN
  INSERT INTO receipts_fts(receipts_fts, rowid, document_name, note)
  VALUES('delete', old.rowid, old.document_name, old.note);
END;
```

**`amount` as INTEGER minor units:** floats are wrong for money. Store satang/cents, format at the edges.

**`id` as TEXT UUID:** the same id names the file on disk. One identifier, used everywhere.

## 8. Error handling

### 8.1 Failure modes

| Failure                     | When                                  | Response                                                     | Recovery                                                                    |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Missing/invalid metadata    | Zod parse fails                       | `400 VALIDATION` with `fields` map                           | Client highlights the field                                                 |
| File too large              | multer `limits.fileSize` exceeded     | `413 FILE_TOO_LARGE` (limit: 25 MB)                          | Client tells user                                                           |
| Wrong file type             | `file-type` byte-sniff fails          | `415 UNSUPPORTED_MEDIA_TYPE`                                 | Client shows allowed types                                                  |
| Mime spoofing               | Sniff differs from claimed header     | Same as above — sniff is authoritative                       | —                                                                           |
| Disk full                   | `fileStore.write()` rejects           | `507 STORAGE_FULL`, no DB row written                        | Operator clears NAS space                                                   |
| DB constraint violation     | Should be caught by Zod first         | `400 VALIDATION` (defense-in-depth)                          | Bug — log and fix                                                           |
| DB busy / locked            | Rare with WAL, possible               | `503 DB_BUSY` + `retryAfter:1`, file unlinked                | Client retries once transparently; only shows toast if the retry also fails |
| File OK, DB insert fails    | Upload step 6                         | File unlinked in catch, return `500 INTERNAL`                | Atomicity preserved                                                         |
| Receipt not found           | `GET /:id`, download, delete          | `404 NOT_FOUND`                                              | Client shows message                                                        |
| DB row exists, file missing | Download stream `ENOENT`              | `410 FILE_GONE`                                              | Operator alerted via logs                                                   |
| NAS mount disappears        | `/data` becomes unreadable at runtime | `503 STORAGE_UNAVAILABLE` from health probe + write attempts | Portainer restart policy                                                    |
| Boot: `/data` not writable  | `index.ts` startup check              | Process exits non-zero, container restarts                   | Operator fixes bind-mount                                                   |
| Boot: migrations fail       | `migrations.ts` throws                | Process exits non-zero                                       | Operator inspects logs                                                      |

### 8.2 Error envelope

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Human-readable summary",
    "fields": { "amount": "must be a positive integer" }
  }
}
```

`code` is a stable enum: `VALIDATION`, `NOT_FOUND`, `FILE_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `STORAGE_FULL`, `STORAGE_UNAVAILABLE`, `FILE_GONE`, `DB_BUSY`, `INTERNAL`. `message` is safe for end users (no stack traces, paths, or SQL). `fields` is optional, only present on `VALIDATION`.

### 8.3 Logging

`pino` with JSON output to stdout. One log line per request: method, path, status, duration, content length, request id. Errors include stack at `warn`/`error` level but the HTTP response never leaks them. Boot-time logs: bind-mount check, migration count, listening port.

### 8.4 Client-side error display

- Form-level validation errors: inline under the offending field.
- Request-level errors: toast/banner with the server's `message`. `DB_BUSY` is retried once transparently before any UI is shown; if the retry also fails, the toast appears with a "Try again" button. `STORAGE_UNAVAILABLE` and network failures show the toast immediately with "Try again".
- Empty states (no results, no receipts yet): explicit empty UI with a CTA back to upload.

### 8.5 Boundary discipline

- Zod-validate every request body and query parameter at the route handler. Internal code trusts inputs once past the boundary.
- Every `catch` either rethrows, converts to an HTTP error, or logs at `error` level with context. No empty catches.
- No try/catch around code that cannot throw.

## 9. Testing strategy

### 9.1 Frameworks

- **Vitest** for both server and client unit + integration tests.
- **supertest** for HTTP integration tests against the real Express app.
- **Playwright** for E2E against a real browser hitting the built bundle served by the real Node server.
- **@vitest/coverage-v8** gated at 80% statements/branches/lines/functions.

### 9.2 Layers

**Unit:**

- `shared/schemas.test.ts` — every valid shape parses, every invalid shape produces the expected field error.
- `server/storage/fileStore.test.ts` — path derivation from uuid + ext + date.
- `server/db/queryBuilder.test.ts` — filter composition, FTS join, pagination math.
- `client/components/Dropzone.test.tsx` — file-type rejection, drag/drop, disabled state.
- Money formatting helpers — minor-unit ↔ display.

**Integration (real SQLite + real tmpdir; no mocks):**

- `POST /api/receipts` — happy path (file at right path, row inserted, FTS searchable), each rejection (bad mime, too large, bad metadata, byte-sniff mismatch).
- `GET /api/receipts` — filter by type, by date range, by `q`, all three combined; pagination math; empty result.
- `GET /api/receipts/:id` and `/file` — 200 happy, 404 missing, 410 when row exists but file is gone.
- `DELETE /api/receipts/:id` — row removed, file unlinked, FTS row removed; 404 missing; orphan tolerance verified.
- Atomicity — simulate DB-insert failure after file write, assert file is unlinked.

Per the global testing rule: **no DB mocks, no filesystem mocks.** Tests run against real SQLite and real tmp directories.

**E2E (Playwright):**

- Golden path: open `/`, drop a PDF, fill the form, click Upload → appears in browse list → click to view detail → click Download → bytes match what was uploaded.
- Search: upload three with distinct names → query → only matches appear.
- Filter: type + date range → only matching rows.
- Delete: from detail page → confirm → list excludes it; old detail URL returns 404.

E2E uses a fresh tmp `DATA_DIR` per test run.

### 9.3 TDD workflow

RED → GREEN → IMPROVE per the global testing rule. Order: shared schemas → DB repo → file store → routes → UI.

### 9.4 CI gates (GitHub Actions, on push + PR)

```
1. lint                          eslint + prettier --check
2. typecheck                     tsc --noEmit on server + client
3. unit + integration tests      vitest run --coverage
4. coverage gate                 fail if any metric < 80%
5. e2e tests                     playwright
6. docker build                  prove the production image builds
```

Portainer's webhook only fires on merge to `main`. A failing CI never reaches the NAS.

### 9.5 Out of scope for testing

- Host SMB / NFS / Docker volume driver behavior — that is NAS-side, not our code.
- Safari — irrelevant for office LAN use. Test Chromium + Firefox only.
- Load testing — defer until traffic profile actually changes.

## 10. Risks and explicit non-goals

- **No virus scanning.** Office-internal LAN; you control who reaches the URL. Add ClamAV later if that changes.
- **No auth.** Anyone on the LAN can delete anything. Acceptable for v1 per stated requirements; add user accounts in a later version if needed.
- **No edit endpoint.** Mistakes are fixed by re-upload + delete. Trades one extra step for a smaller surface area.
- **Orphan files.** If a `DELETE` happens to unlink the file before the row is gone, the worst case is a wasted file on disk. A periodic sweep job is documented as a v2 candidate but not implemented in v1.
- **No HTTPS.** LAN-only. If the URL ever becomes reachable from the public internet, add nginx + Let's Encrypt or a Cloudflare Tunnel in front before exposure.
