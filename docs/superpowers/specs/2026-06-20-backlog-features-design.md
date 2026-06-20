# Backlog Features — Design Spec

**Date:** 2026-06-20
**Status:** Approved, ready for implementation plan
**Scope:** The three unscheduled backlog items from [`docs/ROADMAP.md`](../../ROADMAP.md):

1. Multi-tag filtering with AND/OR
2. Orphan-file sweep job (manual)
3. Thumbnails in the browse list

These are independent subsystems delivered under one spec. The implementation plan
phases them (Feature 1 → 2 → 3) so each lands independently.

---

## Feature 1 — Multi-tag filtering (AND/OR)

### Current state

`ListQuery.tagId` is a single optional UUID. `buildListSQL` joins
`document_tags` once and filters `dt.tag_id = ?` (`documentsRepo.ts:124`). The
browse filter UI exposes a single `<select>` of tags (`BrowsePage.tsx:117`).

### Target behaviour

Users select one or more tags and choose a match mode:

- **All (AND)** — document must carry every selected tag. (Default.)
- **Any (OR)** — document carries at least one selected tag.

### Schema (`shared/schemas.ts`)

Replace `tagId` with:

```ts
tagIds: z.array(z.string().uuid()).max(20).optional(),
tagMatch: z.enum(['all', 'any']).default('all'),
```

`tagId` is removed (the only consumer is this app's own client). Sent on the wire
as repeated query params: `?tagIds=<uuid>&tagIds=<uuid>&tagMatch=all`. Express's
default query parser produces an array for repeated keys; a single `tagIds` value
must still coerce to a one-element array — normalize in the route before parsing
(wrap a non-array `tagIds` in an array).

### Query (`documentsRepo.ts` → `buildListSQL`)

Use a correlated subquery rather than the existing join, which avoids row
duplication and keeps `LIMIT/OFFSET` and the `COUNT(DISTINCT d.id)` count correct:

- **any**:
  `d.id IN (SELECT document_id FROM document_tags WHERE tag_id IN (?, ?, …))`
- **all**: same subquery plus
  `GROUP BY document_id HAVING COUNT(DISTINCT tag_id) = <N>`
  where `N` is the number of selected tag IDs.

Empty/absent `tagIds` adds no clause (behaves as today's "All").

### UI (`BrowsePage.tsx` → `FilterPanel`)

- Replace the single tag `<select>` with a native **`<select multiple>`** listbox
  bound to `tagIds: string[]` (read `selectedOptions` on change).
- Add an **All / Any** radio group bound to `tagMatch` (default `all`).
- Add a short helper hint: "Hold Ctrl/⌘ to select multiple."
- `FilterValues` gains `tagIds: string[]` and `tagMatch: 'all' | 'any'`;
  `EMPTY_FILTERS` defaults them to `[]` and `'all'`. The list request maps
  `tagIds` (omit when empty) and always sends `tagMatch`.

### Tests

- Repo/list unit tests: AND returns only docs with all tags; OR returns the union;
  single tag still works; empty list is a no-op.
- Client `BrowsePage` test: multi-select drives `tagIds`; toggle drives `tagMatch`.
- `api.test.ts`: query string encodes repeated `tagIds` + `tagMatch`.
- Update `e2e/filter.spec.ts` for the multi-select + toggle.

---

## Feature 2 — Orphan-file sweep (manual)

### Problem

Delete is "DB row first, then unlink file" (`documents.ts:175-176`). If the unlink
fails or the process dies between the two steps, a file is orphaned at
`DATA_DIR/file/YYYY/MM/<id>.<ext>` with no DB row — wasted disk, never reclaimed.

### Endpoint

`POST /api/maintenance/orphans/sweep` → `200`:

```json
{ "scanned": 1204, "removed": 3, "bytesFreed": 1258291 }
```

Query param `?dryRun=true` reports the same shape without deleting (used by tests;
the UI calls the real delete mode). No auth — consistent with the app's current
LAN-only, no-auth posture (auth is Phase 3).

### Logic (new `server/src/storage/orphanSweep.ts`)

1. Load all document IDs from the DB into a `Set<string>`.
2. Walk `DATA_DIR/file/` recursively (`YYYY/MM/<file>`).
3. For each file, derive `id` = filename without extension. If `id` is not in the
   set, it is an orphan candidate.
4. **Safety guard:** skip any candidate whose `mtime` is newer than
   `ORPHAN_MIN_AGE_MS` (default `60_000`). Uploads write the file before the row
   commits, so a too-eager sweep could delete an in-flight upload. The guard makes
   that race safe.
5. Unless `dryRun`, unlink each orphan and accumulate `bytesFreed` from its size.
6. Return `{ scanned, removed, bytesFreed }`. `scanned` counts every file walked.

`ORPHAN_MIN_AGE_MS` is a named constant in the sweep module with an optional env
override (`ORPHAN_SWEEP_MIN_AGE_MS`); document it in config if added there.

### Route wiring

New `server/src/routes/maintenance.ts` mounted at `/api/maintenance` in `app.ts`.

### UI

New **Maintenance** tab in Settings (`client/src/pages/settings/MaintenanceTab.tsx`,
registered alongside Categories/Tags/DocumentTypes) with a "Run orphan-file
cleanup" button. On click it calls `maintenanceApi.sweepOrphans()` and renders the
report (e.g. "Scanned 1,204 files, removed 3 orphans (1.2 MB)"). Disable the button
while running; surface errors inline.

### Tests

- Sweep unit test (real temp dir): orphan file removed; file with a matching DB row
  kept; recent file (mtime within guard) skipped; `dryRun` deletes nothing but
  reports counts; `bytesFreed` sums correctly.
- Client `MaintenanceTab` test: button triggers the API and renders the report;
  error path shows a message.

---

## Feature 3 — Thumbnails in the browse list

### Current state

Inline PDF preview already exists in the detail view via `<iframe>`
(`DocumentPreview.tsx:45`). The browse list is a table with no previews
(`BrowsePage.tsx:303`).

### Target behaviour

Add a leading **Preview** cell to each browse-table row:

- Image mimes (`image/png`, `image/jpeg`, `image/gif`, `image/webp`) → real
  `<img loading="lazy" decoding="async">` from `api.fileUrl(d.id, { inline: true })`,
  sized ~44px square via CSS (object-fit: cover), `alt` = `originalName`.
- Everything else → a type icon: 📄 pdf, 🎵 audio, 🎬 video, 🖼 other image,
  📁 other.

Client-only; reuses the existing `GET /:id/file?inline` endpoint, no server change.

### Components

- New `client/src/components/Thumbnail.tsx` (+ small CSS) taking a `DocumentDTO`
  (or `{ id, mimeType, originalName }`) and rendering image-or-icon.
- Extract the shared `PREVIEWABLE_IMAGE_TYPES` set out of `DocumentPreview.tsx`
  into `client/src/lib/mediaTypes.ts`; both `DocumentPreview` and `Thumbnail`
  import it (DRY).

### Tests

- `Thumbnail` test: renders `<img>` with correct src for an image mime; renders the
  expected icon for pdf/audio/video/other.
- `BrowsePage` test updated for the new preview cell.

---

## Out of scope

- Editing/renaming tags from the filter UI (Settings ▸ Tags already covers it).
- Server-generated thumbnails (sharp/pdf/ffmpeg) — rejected as too heavy for a LAN
  app; revisit only if image-only thumbnails prove insufficient.
- Scheduled/automatic orphan sweeping — manual button only, by decision.
- Auth on the maintenance endpoint — deferred to Phase 3 with the rest of auth.

## Testing summary

All three features ship with unit tests (server + client) meeting the project's
coverage bar, plus an e2e update for multi-tag filtering. `npm test`,
`npm run typecheck`, and `npm run format:check` must pass before merge.
