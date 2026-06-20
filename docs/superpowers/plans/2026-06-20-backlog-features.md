# Backlog Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three roadmap backlog items — multi-tag filtering (AND/OR), a manual orphan-file sweep, and browse-list thumbnails.

**Architecture:** Multi-tag filtering replaces the single `tagId` query param with a `tagIds[]` + `tagMatch` pair, resolved by a correlated subquery in `documentsRepo`. The orphan sweep is a new pure module driven by a `POST /api/maintenance/orphans/sweep` route and a Settings tab. Thumbnails are a client-only `Thumbnail` component reusing the existing inline-file endpoint.

**Tech Stack:** TypeScript, Express, better-sqlite3, Zod, React, Vitest, Supertest, Playwright.

## Global Constraints

- `npm test`, `npm run typecheck`, and `npm run format:check` must pass before each commit.
- TypeScript: no `any`; explicit types on exported functions; immutable updates (spread, no in-place mutation).
- ESM imports use `.js` extensions on relative paths (e.g. `'./api.js'`), matching the codebase.
- Functions < 50 lines; files focused; named constants instead of magic numbers.
- Conventional-commit messages (`feat:`, `test:`, `refactor:`, `docs:`).
- Commit after every green test cycle.

---

## File Structure

**Feature 1 — Multi-tag filtering**

- Modify: `shared/schemas.ts` — `ListQuerySchema` (`tagIds`, `tagMatch`).
- Modify: `server/src/db/documentsRepo.ts` — `buildListSQL` tag clause.
- Modify: `server/src/routes/documents.ts` — normalize single `tagIds` to array before parse.
- Create: `server/test/multiTagFilter.test.ts`.
- Modify: `client/src/api.ts` — `buildQuery` tag encoding.
- Modify: `client/src/pages/BrowsePage.tsx` — multi-select + match toggle.
- Modify: `client/src/api.test.ts`, `client/src/pages/BrowsePage.test.tsx`, `e2e/filter.spec.ts`.

**Feature 2 — Orphan-file sweep**

- Modify: `server/src/db/documentsRepo.ts` — `allIds()`.
- Create: `server/src/storage/orphanSweep.ts`.
- Create: `server/src/routes/maintenance.ts`.
- Modify: `server/src/app.ts` (`AppDeps.fileRoot`, mount), `server/src/index.ts`, `server/test/helpers.ts`.
- Create: `server/test/orphanSweep.test.ts`, `server/test/maintenance.test.ts`.
- Modify: `client/src/api.ts` — `maintenanceApi`.
- Create: `client/src/pages/settings/MaintenanceTab.tsx`, `client/src/pages/settings/MaintenanceTab.test.tsx`.
- Modify: `client/src/pages/SettingsPage.tsx` — register tab.

**Feature 3 — Thumbnails**

- Create: `client/src/lib/mediaTypes.ts`.
- Modify: `client/src/components/DocumentPreview.tsx` — import shared constant.
- Create: `client/src/components/Thumbnail.tsx`, `client/src/components/thumbnail.css`, `client/src/components/Thumbnail.test.tsx`.
- Modify: `client/src/pages/BrowsePage.tsx` — preview cell.

---

## Task 1: Multi-tag query (schema + repo + route)

**Files:**

- Modify: `shared/schemas.ts:67-79`
- Modify: `server/src/db/documentsRepo.ts:124-128`
- Modify: `server/src/routes/documents.ts:128-136`
- Test: `server/test/multiTagFilter.test.ts`

**Interfaces:**

- Produces: `ListQuery.tagIds?: string[]`, `ListQuery.tagMatch: 'all' | 'any'`. `repo.list(q)` filters by these.

- [ ] **Step 1: Write the failing test**

Create `server/test/multiTagFilter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeTestEnv } from './helpers.js';

function dto(id: string, name: string) {
  return {
    id,
    documentName: name,
    type: 'other',
    documentDate: '2026-01-01',
    invoiceDate: null,
    amount: null,
    currency: null,
    shortNote: null,
    note: null,
    filename: `${id}.pdf`,
    originalName: 'x.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('multi-tag filtering', () => {
  it('AND returns only docs carrying every selected tag; OR returns the union', () => {
    const env = makeTestEnv();
    try {
      const a = env.repo.insertWithRelations({
        dto: dto('id1', 'Doc1'),
        categoryId: null,
        tagNames: ['alpha', 'beta'],
      });
      env.repo.insertWithRelations({
        dto: dto('id2', 'Doc2'),
        categoryId: null,
        tagNames: ['alpha'],
      });
      const alpha = a.tags.find((t) => t.name === 'alpha')!.id;
      const beta = a.tags.find((t) => t.name === 'beta')!.id;

      const and = env.repo.list({ tagIds: [alpha, beta], tagMatch: 'all', page: 1, pageSize: 20 });
      expect(and.items.map((d) => d.id)).toEqual(['id1']);

      const or = env.repo.list({ tagIds: [alpha, beta], tagMatch: 'any', page: 1, pageSize: 20 });
      expect(or.items.map((d) => d.id).sort()).toEqual(['id1', 'id2']);

      const single = env.repo.list({ tagIds: [beta], tagMatch: 'all', page: 1, pageSize: 20 });
      expect(single.items.map((d) => d.id)).toEqual(['id1']);
    } finally {
      env.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/multiTagFilter.test.ts`
Expected: FAIL (TypeScript error — `tagIds`/`tagMatch` not on `ListQuery`).

- [ ] **Step 3: Update the schema**

In `shared/schemas.ts`, in `ListQuerySchema` replace the line `tagId: z.string().uuid().optional(),` with:

```ts
  tagIds: z.array(z.string().uuid()).max(20).optional(),
  tagMatch: z.enum(['all', 'any']).default('all'),
```

- [ ] **Step 4: Update the repo query**

In `server/src/db/documentsRepo.ts`, replace the `if (q.tagId) { … }` block (lines ~124-128) with:

```ts
if (q.tagIds && q.tagIds.length > 0) {
  const placeholders = q.tagIds.map(() => '?').join(',');
  if (q.tagMatch === 'any') {
    where.push(`d.id IN (SELECT document_id FROM document_tags WHERE tag_id IN (${placeholders}))`);
    params.push(...q.tagIds);
  } else {
    where.push(
      `d.id IN (SELECT document_id FROM document_tags WHERE tag_id IN (${placeholders})` +
        ` GROUP BY document_id HAVING COUNT(DISTINCT tag_id) = ?)`,
    );
    params.push(...q.tagIds, q.tagIds.length);
  }
}
```

(The old block added a `JOIN document_tags dt`; the subquery makes that join unnecessary — there is no other `dt` reference to keep.)

- [ ] **Step 5: Normalize single-value query param in the route**

In `server/src/routes/documents.ts`, replace the body of `r.get('/', …)`:

```ts
r.get('/', (req, res, next) => {
  try {
    const raw: Record<string, unknown> = { ...req.query };
    if (raw.tagIds !== undefined && !Array.isArray(raw.tagIds)) {
      raw.tagIds = [raw.tagIds];
    }
    const q = ListQuerySchema.parse(raw);
    res.json(repo.list(q));
  } catch (e) {
    next(e);
  }
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run server/test/multiTagFilter.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck` (Expected: no errors. If other files still reference `tagId`, they are fixed in Task 2 — run `npx vitest run server/test/multiTagFilter.test.ts` is green regardless.)

```bash
git add shared/schemas.ts server/src/db/documentsRepo.ts server/src/routes/documents.ts server/test/multiTagFilter.test.ts
git commit -m "feat: multi-tag filtering with AND/OR match in documents query"
```

---

## Task 2: Multi-tag client UI + e2e

**Files:**

- Modify: `client/src/api.ts:72-86` (`buildQuery`)
- Modify: `client/src/pages/BrowsePage.tsx`
- Test: `client/src/api.test.ts`, `client/src/pages/BrowsePage.test.tsx`, `e2e/filter.spec.ts`

**Interfaces:**

- Consumes: `ListQuery.tagIds`, `ListQuery.tagMatch` (Task 1).

- [ ] **Step 1: Write the failing api test**

In `client/src/api.test.ts`, add a test that the query string encodes repeated `tagIds` and `tagMatch`. Mirror the existing fetch-mocking style in that file (find an existing `api.list` test and copy its mock setup). The new assertion:

```ts
it('encodes multiple tagIds and tagMatch in the list query', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
  await api.list({
    tagIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
    tagMatch: 'any',
  });
  const url = String(fetchMock.mock.calls[0][0]);
  expect(url).toContain('tagIds=11111111-1111-1111-1111-111111111111');
  expect(url).toContain('tagIds=22222222-2222-2222-2222-222222222222');
  expect(url).toContain('tagMatch=any');
  fetchMock.mockRestore();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/api.test.ts`
Expected: FAIL (URL lacks `tagIds`).

- [ ] **Step 3: Update `buildQuery`**

In `client/src/api.ts`, in `buildQuery`, replace `if (q.tagId) sp.set('tagId', q.tagId);` with:

```ts
if (q.tagIds && q.tagIds.length > 0) {
  for (const id of q.tagIds) sp.append('tagIds', id);
}
if (q.tagMatch) sp.set('tagMatch', q.tagMatch);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run client/src/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Update BrowsePage filter state and UI**

In `client/src/pages/BrowsePage.tsx`:

(a) In `interface FilterValues`, replace `tagId: string;` with:

```ts
  tagIds: string[];
  tagMatch: 'all' | 'any';
```

(b) In `EMPTY_FILTERS`, replace `tagId: '',` with:

```ts
  tagIds: [],
  tagMatch: 'all',
```

(c) Replace the Tag `<label>`/`<select>` block (the single-select, lines ~117-130) with:

```tsx
      <label htmlFor="filter-tags">Tags</label>
      <select
        id="filter-tags"
        multiple
        value={draft.tagIds}
        onChange={(e) =>
          update(
            'tagIds',
            Array.from(e.target.selectedOptions, (o) => o.value),
          )
        }
        style={{ width: '100%', minHeight: 96 }}
      >
        {tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <small style={{ color: 'var(--fi-ink-soft)' }}>Hold Ctrl/⌘ to select multiple</small>
      <fieldset style={{ border: 'none', padding: 0, margin: '8px 0 0' }}>
        <legend style={{ padding: 0, fontSize: 13 }}>Tag match</legend>
        <label>
          <input
            type="radio"
            name="tagMatch"
            checked={draft.tagMatch === 'all'}
            onChange={() => update('tagMatch', 'all')}
          />{' '}
          All
        </label>{' '}
        <label>
          <input
            type="radio"
            name="tagMatch"
            checked={draft.tagMatch === 'any'}
            onChange={() => update('tagMatch', 'any')}
          />{' '}
          Any
        </label>
      </fieldset>
```

(d) In the `api.list({ … })` call inside the effect, replace `tagId: applied.tagId || undefined,` with:

```ts
        tagIds: applied.tagIds.length ? applied.tagIds : undefined,
        tagMatch: applied.tagMatch,
```

- [ ] **Step 6: Update the BrowsePage test**

In `client/src/pages/BrowsePage.test.tsx`, the existing test that checks tag-filter population references the single select. Update it to assert the multi-select renders the tag options. Find the assertion referencing the tag dropdown and change it to locate `#filter-tags` (a `<select multiple>`) and assert its options match the mocked tags. If the test selected a tag via `selectOptions`, keep using `userEvent.selectOptions(screen.getByLabelText('Tags'), [tagId])`.

- [ ] **Step 7: Run client tests**

Run: `npx vitest run client/src/pages/BrowsePage.test.tsx client/src/api.test.ts`
Expected: PASS.

- [ ] **Step 8: Update the e2e filter spec**

In `e2e/filter.spec.ts`, append a new test (the `uploadOne` helper there does not add tags, so add tags inline via the upload form's tag input, placeholder `Add tag…`):

```ts
test('filter by multiple tags with AND match', async ({ page }) => {
  async function uploadTagged(name: string, tags: string[]) {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
    await page.getByLabel('Document Name').fill(name);
    await page.getByLabel('Type').selectOption('other');
    for (const t of tags) {
      await page.getByPlaceholder('Add tag…').fill(t);
      await page.getByPlaceholder('Add tag…').press('Enter');
    }
    await page.getByRole('button', { name: /^Upload$/ }).click();
    await expect(page.locator('h2', { hasText: name })).toBeVisible();
  }

  await uploadTagged('Both', ['alpha', 'beta']);
  await uploadTagged('OnlyAlpha', ['alpha']);

  await page.goto('/browse');
  await page.getByLabel('Tags').selectOption([{ label: 'alpha' }, { label: 'beta' }]);
  await page.getByRole('radio', { name: 'All' }).check();
  await page.getByRole('button', { name: 'Apply' }).first().click();

  await expect(page.locator('text=Both')).toBeVisible();
  await expect(page.locator('text=OnlyAlpha')).not.toBeVisible();
});
```

- [ ] **Step 9: Run e2e and commit**

Run: `npx playwright test e2e/filter.spec.ts --project=chromium`
Expected: PASS (both tests).

```bash
git add client/src/api.ts client/src/pages/BrowsePage.tsx client/src/api.test.ts client/src/pages/BrowsePage.test.tsx e2e/filter.spec.ts
git commit -m "feat: multi-tag filter UI with All/Any toggle"
```

---

## Task 3: Orphan-sweep module + repo.allIds()

**Files:**

- Modify: `server/src/db/documentsRepo.ts` (add `allIds`)
- Create: `server/src/storage/orphanSweep.ts`
- Test: `server/test/orphanSweep.test.ts`

**Interfaces:**

- Produces: `repo.allIds(): string[]`; `sweepOrphans(opts: SweepOptions): Promise<SweepReport>` where `SweepReport = { scanned: number; removed: number; bytesFreed: number }` and `SweepOptions = { fileRoot: string; knownIds: Set<string>; dryRun?: boolean; minAgeMs?: number; now?: number }`.

- [ ] **Step 1: Write the failing test**

Create `server/test/orphanSweep.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/test/orphanSweep.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module**

Create `server/src/storage/orphanSweep.ts`:

```ts
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
```

- [ ] **Step 4: Add `allIds` to the repo**

In `server/src/db/documentsRepo.ts`, inside the returned object (next to `delete`/`reset`), add:

```ts
    allIds(): string[] {
      return (db.prepare('SELECT id FROM documents').all() as Array<{ id: string }>).map(
        (r) => r.id,
      );
    },
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run server/test/orphanSweep.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/storage/orphanSweep.ts server/src/db/documentsRepo.ts server/test/orphanSweep.test.ts
git commit -m "feat: orphan-file sweep module and repo.allIds()"
```

---

## Task 4: Maintenance route + app wiring

**Files:**

- Create: `server/src/routes/maintenance.ts`
- Modify: `server/src/app.ts`, `server/src/index.ts`, `server/test/helpers.ts`
- Test: `server/test/maintenance.test.ts`

**Interfaces:**

- Consumes: `sweepOrphans`, `repo.allIds()` (Task 3).
- Produces: `POST /api/maintenance/orphans/sweep` → `{ scanned, removed, bytesFreed }`; `AppDeps.fileRoot: string`.

- [ ] **Step 1: Write the failing test**

Create `server/test/maintenance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { makeTestEnv } from './helpers.js';

function backdate(file: string): void {
  const old = new Date(Date.now() - 5 * 60_000);
  fs.utimesSync(file, old, old);
}

describe('POST /api/maintenance/orphans/sweep', () => {
  it('removes orphan files and keeps files with a matching document row', async () => {
    const env = makeTestEnv();
    try {
      const dir = path.join(env.tmp, 'file', '2026', '01');
      fs.mkdirSync(dir, { recursive: true });
      const orphan = path.join(dir, 'orphan-id.pdf');
      fs.writeFileSync(orphan, 'orphaned');
      backdate(orphan);

      env.repo.insertWithRelations({
        dto: {
          id: 'known-id',
          documentName: 'Keep',
          type: 'other',
          documentDate: '2026-01-01',
          invoiceDate: null,
          amount: null,
          currency: null,
          shortNote: null,
          note: null,
          filename: 'known-id.pdf',
          originalName: 'k.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 5,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        categoryId: null,
        tagNames: [],
      });
      const known = path.join(dir, 'known-id.pdf');
      fs.writeFileSync(known, 'keep');
      backdate(known);

      const res = await request(env.app).post('/api/maintenance/orphans/sweep');
      expect(res.status).toBe(200);
      expect(res.body.removed).toBe(1);
      expect(fs.existsSync(orphan)).toBe(false);
      expect(fs.existsSync(known)).toBe(true);
    } finally {
      env.cleanup();
    }
  });

  it('dryRun=true reports without deleting', async () => {
    const env = makeTestEnv();
    try {
      const dir = path.join(env.tmp, 'file', '2026', '01');
      fs.mkdirSync(dir, { recursive: true });
      const orphan = path.join(dir, 'orphan-id.pdf');
      fs.writeFileSync(orphan, 'orphaned');
      backdate(orphan);

      const res = await request(env.app).post('/api/maintenance/orphans/sweep?dryRun=true');
      expect(res.status).toBe(200);
      expect(res.body.removed).toBe(1);
      expect(fs.existsSync(orphan)).toBe(true);
    } finally {
      env.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/test/maintenance.test.ts`
Expected: FAIL (404 — route not mounted; and `makeTestEnv` does not yet pass `fileRoot`).

- [ ] **Step 3: Create the route**

Create `server/src/routes/maintenance.ts`:

```ts
import { Router } from 'express';
import { sweepOrphans } from '../storage/orphanSweep.js';
import type { createDocumentsRepo } from '../db/documentsRepo.js';

interface Deps {
  repo: ReturnType<typeof createDocumentsRepo>;
  fileRoot: string;
}

export function maintenanceRouter(deps: Deps): Router {
  const r = Router();
  r.post('/orphans/sweep', async (req, res, next) => {
    try {
      const dryRun = req.query.dryRun === 'true' || req.query.dryRun === '1';
      const knownIds = new Set(deps.repo.allIds());
      const minAgeMs = process.env.ORPHAN_SWEEP_MIN_AGE_MS
        ? Number(process.env.ORPHAN_SWEEP_MIN_AGE_MS)
        : undefined;
      const report = await sweepOrphans({ fileRoot: deps.fileRoot, knownIds, dryRun, minAgeMs });
      res.json(report);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
```

- [ ] **Step 4: Wire it into the app**

In `server/src/app.ts`:

(a) Add the import after the other route imports:

```ts
import { maintenanceRouter } from './routes/maintenance.js';
```

(b) Add `fileRoot: string;` to the `AppDeps` interface (after `store: FileStore;`).

(c) Mount it after the tags router:

```ts
app.use('/api/maintenance', maintenanceRouter({ repo: deps.repo, fileRoot: deps.fileRoot }));
```

- [ ] **Step 5: Pass `fileRoot` from production and test wiring**

(a) In `server/src/index.ts`, add `fileRoot: cfg.fileRoot,` to the `buildApp({ … })` call (alongside `store`).

(b) In `server/test/helpers.ts`, add `fileRoot: path.join(tmp, 'file'),` to the `buildApp({ … })` call (alongside `store`).

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run server/test/maintenance.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add server/src/routes/maintenance.ts server/src/app.ts server/src/index.ts server/test/helpers.ts server/test/maintenance.test.ts
git commit -m "feat: POST /api/maintenance/orphans/sweep endpoint"
```

---

## Task 5: Maintenance Settings tab

**Files:**

- Modify: `client/src/api.ts` (add `maintenanceApi`)
- Create: `client/src/pages/settings/MaintenanceTab.tsx`
- Modify: `client/src/pages/SettingsPage.tsx`
- Test: `client/src/pages/settings/MaintenanceTab.test.tsx`

**Interfaces:**

- Consumes: `POST /api/maintenance/orphans/sweep` (Task 4).
- Produces: `maintenanceApi.sweepOrphans(): Promise<{ scanned: number; removed: number; bytesFreed: number }>`.

- [ ] **Step 1: Write the failing test**

Create `client/src/pages/settings/MaintenanceTab.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MaintenanceTab } from './MaintenanceTab.js';

afterEach(() => vi.restoreAllMocks());

describe('MaintenanceTab', () => {
  it('runs the sweep and shows the report', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ scanned: 10, removed: 2, bytesFreed: 2048 }), { status: 200 }),
    );
    render(<MaintenanceTab />);
    await userEvent.click(screen.getByRole('button', { name: /run orphan-file cleanup/i }));
    expect(await screen.findByText(/removed 2 orphans/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/pages/settings/MaintenanceTab.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Add the API method**

In `client/src/api.ts`, add an exported `maintenanceApi` (after `documentTypesApi`):

```ts
export const maintenanceApi = {
  sweepOrphans(): Promise<{ scanned: number; removed: number; bytesFreed: number }> {
    return request('/api/maintenance/orphans/sweep', { method: 'POST' });
  },
};
```

- [ ] **Step 4: Implement the tab**

Create `client/src/pages/settings/MaintenanceTab.tsx`:

```tsx
import { useState } from 'react';
import { maintenanceApi } from '../../api.js';

interface Report {
  scanned: number;
  removed: number;
  bytesFreed: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function MaintenanceTab() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setReport(await maintenanceApi.sweepOrphans());
    } catch (e) {
      setError((e as { message: string }).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <h2>Maintenance</h2>
      <p>Remove files left on disk that no longer have a document record.</p>
      <button type="button" onClick={run} disabled={running}>
        {running ? 'Running…' : 'Run orphan-file cleanup'}
      </button>
      {report && (
        <p>
          Scanned {report.scanned} files, removed {report.removed} orphans (
          {formatBytes(report.bytesFreed)}).
        </p>
      )}
      {error && <p style={{ color: '#c00' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Register the tab**

In `client/src/pages/SettingsPage.tsx`:

(a) Add the import:

```ts
import { MaintenanceTab } from './settings/MaintenanceTab.js';
```

(b) Extend the `Tab` type: `type Tab = 'tags' | 'categories' | 'document-types' | 'maintenance';`

(c) Add a tab button after the Tags button:

```tsx
<button role="tab" aria-selected={tab === 'maintenance'} onClick={() => setTab('maintenance')}>
  Maintenance
</button>
```

(d) Add the panel line after the tags panel:

```tsx
{
  tab === 'maintenance' && <MaintenanceTab />;
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run client/src/pages/settings/MaintenanceTab.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/api.ts client/src/pages/settings/MaintenanceTab.tsx client/src/pages/SettingsPage.tsx client/src/pages/settings/MaintenanceTab.test.tsx
git commit -m "feat: Settings Maintenance tab for orphan-file cleanup"
```

---

## Task 6: Thumbnail component + shared media types

**Files:**

- Create: `client/src/lib/mediaTypes.ts`
- Modify: `client/src/components/DocumentPreview.tsx:7`
- Create: `client/src/components/Thumbnail.tsx`, `client/src/components/thumbnail.css`
- Test: `client/src/components/Thumbnail.test.tsx`

**Interfaces:**

- Produces: `PREVIEWABLE_IMAGE_TYPES: Set<string>`, `isPreviewableImage(mime: string): boolean`, `Thumbnail` component taking `{ id: string; mimeType: string; originalName: string }`.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/Thumbnail.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Thumbnail } from './Thumbnail.js';

describe('Thumbnail', () => {
  it('renders an <img> at the inline endpoint for image types', () => {
    render(<Thumbnail id="abc" mimeType="image/png" originalName="pic.png" />);
    const img = screen.getByAltText('pic.png');
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toContain('/api/documents/abc/file');
  });

  it('renders a type icon for non-image types', () => {
    render(<Thumbnail id="abc" mimeType="application/pdf" originalName="d.pdf" />);
    expect(screen.getByLabelText('application/pdf').textContent).toBe('📄');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/components/Thumbnail.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the shared media-type module**

Create `client/src/lib/mediaTypes.ts`:

```ts
// Narrow allow-list. image/svg+xml is excluded because SVG can carry <script>.
export const PREVIEWABLE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function isPreviewableImage(mime: string): boolean {
  return PREVIEWABLE_IMAGE_TYPES.has(mime);
}
```

- [ ] **Step 4: Reuse it in DocumentPreview**

In `client/src/components/DocumentPreview.tsx`, remove the local `PREVIEWABLE_IMAGE_TYPES` const (lines 5-7) and add at the top with the other imports:

```ts
import { PREVIEWABLE_IMAGE_TYPES } from '../lib/mediaTypes.js';
```

(The existing `PREVIEWABLE_IMAGE_TYPES.has(doc.mimeType)` usage is unchanged.)

- [ ] **Step 5: Implement the Thumbnail component and CSS**

Create `client/src/components/thumbnail.css`:

```css
.thumbnail {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--fi-surface);
  border: 1px solid var(--fi-line);
  overflow: hidden;
}
.thumbnail--image {
  object-fit: cover;
}
.thumbnail--icon {
  font-size: 22px;
}
```

Create `client/src/components/Thumbnail.tsx`:

```tsx
import { api } from '../api.js';
import { isPreviewableImage } from '../lib/mediaTypes.js';
import './thumbnail.css';

interface ThumbnailProps {
  id: string;
  mimeType: string;
  originalName: string;
}

function iconFor(mime: string): string {
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('image/')) return '🖼';
  return '📁';
}

export function Thumbnail({ id, mimeType, originalName }: ThumbnailProps) {
  if (isPreviewableImage(mimeType)) {
    return (
      <img
        className="thumbnail thumbnail--image"
        src={api.fileUrl(id, { inline: true })}
        alt={originalName}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span className="thumbnail thumbnail--icon" role="img" aria-label={mimeType}>
      {iconFor(mimeType)}
    </span>
  );
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run client/src/components/Thumbnail.test.tsx client/src/components/DocumentPreview.test.tsx`
Expected: PASS (Thumbnail + unchanged DocumentPreview tests).

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/mediaTypes.ts client/src/components/DocumentPreview.tsx client/src/components/Thumbnail.tsx client/src/components/thumbnail.css client/src/components/Thumbnail.test.tsx
git commit -m "feat: Thumbnail component and shared media-type allow-list"
```

---

## Task 7: Browse-list preview cell

**Files:**

- Modify: `client/src/pages/BrowsePage.tsx`
- Test: `client/src/pages/BrowsePage.test.tsx`

**Interfaces:**

- Consumes: `Thumbnail` (Task 6).

- [ ] **Step 1: Write the failing test**

In `client/src/pages/BrowsePage.test.tsx`, add a test asserting a thumbnail/icon renders for a listed document. Use the file's existing render helper and mocked `api.list`. With a mocked document of `mimeType: 'application/pdf'`:

```tsx
it('shows a preview icon for each listed document', async () => {
  // (reuse the file's existing setup that mocks api.list to return one pdf document)
  expect(await screen.findByLabelText('application/pdf')).toBeInTheDocument();
});
```

If the file's existing list mock omits `mimeType`/`originalName`, add them to the mocked document so the `Thumbnail` renders.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/pages/BrowsePage.test.tsx`
Expected: FAIL (no element with that label).

- [ ] **Step 3: Add the preview column**

In `client/src/pages/BrowsePage.tsx`:

(a) Add the import:

```ts
import { Thumbnail } from '../components/Thumbnail.js';
```

(b) In the table `<thead>` row, add a leading header cell before `<th>Name</th>`:

```tsx
<th></th>
```

(c) In the `<tbody>` row, add a leading cell before the Name `<td>`:

```tsx
<td>
  <Thumbnail id={d.id} mimeType={d.mimeType} originalName={d.originalName} />
</td>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run client/src/pages/BrowsePage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npm test && npm run format:check`
Expected: typecheck clean, all unit tests pass, formatting clean. If `format:check` flags any new file, run `npm run format` and re-stage.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/BrowsePage.tsx client/src/pages/BrowsePage.test.tsx
git commit -m "feat: thumbnails in the browse document list"
```

---

## Final verification (after all tasks)

- [ ] Run `npm run typecheck` — no errors.
- [ ] Run `npm test` — all unit/integration tests pass.
- [ ] Run `npx playwright test --project=chromium` — e2e green (includes the new multi-tag test).
- [ ] Run `npm run format:check` — clean.
- [ ] Update `docs/ROADMAP.md`: move the three items from "Backlog — Unscheduled" into "Shipped".
