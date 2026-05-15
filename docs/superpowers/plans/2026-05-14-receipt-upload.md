# Receipt Upload v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a LAN-only, single-container web app that lets a small Thai office upload receipts/invoices/quotations to a Synology NAS and browse/filter/search them, deployed via Portainer Git stack on port 5900.

**Architecture:** One Node 20 + Express process serving a built React SPA and a JSON API. SQLite (with FTS5) for metadata at `/data/db/receipts.db`; uploaded files at `/data/file/{YYYY}/{MM}/{uuid}.{ext}`. The container bind-mounts the Synology path `/volume1/docker/Document-Management` at `/data`. No auth, LAN-only.

**Tech Stack:**
- Server: Node 20, Express 4, TypeScript, better-sqlite3, multer, file-type, zod, pino
- Client: React 18, Vite, TypeScript, react-router, zod
- Test: Vitest, supertest, Playwright
- Ship: Multi-stage Dockerfile, docker-compose.yml, GitHub Actions, Portainer Git stack + webhook

**Spec reference:** `docs/superpowers/specs/2026-05-14-receipt-upload-design.md`

---

## File Structure

```
.
├── package.json                       single package.json for whole repo
├── tsconfig.base.json                 shared TS settings + path aliases
├── tsconfig.server.json               extends base, NodeNext, outputs server/dist
├── tsconfig.client.json               extends base, used by Vite
├── vite.config.ts                     client dev server + build config
├── vitest.config.ts                   unit + integration test config
├── playwright.config.ts               E2E config
├── .eslintrc.cjs
├── .prettierrc.json
├── .dockerignore
├── Dockerfile                         multi-stage: client build → server build → runtime
├── docker-compose.yml                 service "receipts" with bind-mount + port 5900
├── README.md                          NAS folder + Portainer steps
├── .github/workflows/ci.yml           lint, typecheck, tests, coverage, docker build
│
├── shared/
│   └── schemas.ts                     Zod schemas + RECEIPT_TYPES, CURRENCIES
│
├── migrations/
│   └── 001_init.sql                   tables + FTS5 + triggers + indexes
│
├── server/
│   ├── src/
│   │   ├── index.ts                   boot: env, migrations, listen
│   │   ├── app.ts                     Express wiring
│   │   ├── config.ts                  env parsing with Zod
│   │   ├── logger.ts                  pino instance
│   │   ├── db/
│   │   │   ├── connection.ts          better-sqlite3 + WAL
│   │   │   ├── migrations.ts          runs migrations/*.sql
│   │   │   └── receiptsRepo.ts        insert, getById, list, search, delete
│   │   ├── storage/
│   │   │   └── fileStore.ts           write, openStream, unlink, derivePath
│   │   ├── middleware/
│   │   │   ├── upload.ts              multer + file-type byte-sniff
│   │   │   └── errorHandler.ts        translate to error envelope
│   │   └── routes/
│   │       ├── receipts.ts            POST/GET/DELETE handlers
│   │       └── health.ts              GET /api/health
│   └── test/                          integration tests (supertest + tmpdir + real sqlite)
│       ├── helpers.ts                 mkTempDir, mkTestApp, fixture files
│       ├── upload.test.ts
│       ├── list.test.ts
│       ├── detail-and-download.test.ts
│       └── delete.test.ts
│
├── client/
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                    router shell + toast container
│       ├── api.ts                     fetch wrappers (with DB_BUSY retry)
│       ├── types.ts                   re-exports from @shared
│       ├── pages/
│       │   ├── UploadPage.tsx
│       │   ├── BrowsePage.tsx
│       │   └── ReceiptDetailPage.tsx
│       └── components/
│           ├── Dropzone.tsx
│           ├── FilterBar.tsx
│           ├── ReceiptList.tsx
│           └── Toast.tsx
│
└── e2e/
    ├── golden-path.spec.ts
    ├── search.spec.ts
    ├── filter.spec.ts
    └── delete.spec.ts
```

---

## Phase 0 — Repository scaffolding

### Task 1: Initialize package.json, TypeScript, tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `tsconfig.server.json`
- Create: `tsconfig.client.json`
- Create: `.eslintrc.cjs`
- Create: `.prettierrc.json`
- Create: `.dockerignore`
- Modify: `.gitignore` (append node_modules, dist, *.tsbuildinfo if not already)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "inhouse-document-management",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev:server": "tsx watch server/src/index.ts",
    "dev:client": "vite",
    "build:server": "tsc -p tsconfig.server.json",
    "build:client": "vite build",
    "build": "npm run build:client && npm run build:server",
    "start": "node server/dist/index.js",
    "lint": "eslint . --ext .ts,.tsx",
    "format:check": "prettier --check .",
    "format": "prettier --write .",
    "typecheck": "tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.client.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "express": "^4.21.0",
    "file-type": "^19.5.0",
    "multer": "^1.4.5-lts.1",
    "pino": "^9.4.0",
    "pino-http": "^10.3.0",
    "uuid": "^10.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.12",
    "@types/node": "^20.16.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/supertest": "^6.0.2",
    "@types/uuid": "^10.0.0",
    "@typescript-eslint/eslint-plugin": "^8.6.0",
    "@typescript-eslint/parser": "^8.6.0",
    "@vitejs/plugin-react": "^4.3.1",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^8.57.0",
    "eslint-plugin-react": "^7.36.0",
    "eslint-plugin-react-hooks": "^4.6.2",
    "jsdom": "^25.0.0",
    "prettier": "^3.3.3",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/*"]
    }
  }
}
```

- [ ] **Step 3: Create `tsconfig.server.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "server/dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["server/src/**/*.ts", "shared/**/*.ts"]
}
```

- [ ] **Step 4: Create `tsconfig.client.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["client/src/**/*.ts", "client/src/**/*.tsx", "shared/**/*.ts"]
}
```

- [ ] **Step 5: Create `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: '18.3' } },
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage', '.superpowers'],
};
```

- [ ] **Step 6: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 7: Create `.dockerignore`**

```
node_modules
server/dist
client/dist
coverage
.git
.github
.superpowers
.claude
docs
e2e
*.tsbuildinfo
.env*
```

- [ ] **Step 8: Append to `.gitignore`**

Read the current `.gitignore` and append these lines if not already present:

```
# Build artifacts
server/dist/
client/dist/
*.tsbuildinfo

# Playwright
test-results/
playwright-report/
```

- [ ] **Step 9: Install deps and verify**

```bash
npm install
npx tsc -p tsconfig.server.json --noEmit
```

Expected: both commands exit 0. No source files exist yet so tsc has nothing to check — that's fine.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json tsconfig.server.json tsconfig.client.json .eslintrc.cjs .prettierrc.json .dockerignore .gitignore
git commit -m "chore: scaffold typescript, eslint, prettier, and npm scripts"
```

---

### Task 2: Configure Vitest with env-per-file split

**Files:**
- Create: `vitest.config.ts`
- Create: `server/test/sample.test.ts` (deleted after verification)

- [ ] **Step 1: Write a tiny placeholder test that proves the runner works**

`server/test/sample.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('sample', () => {
  it('adds', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'shared') },
  },
  test: {
    environmentMatchGlobs: [
      ['client/**', 'jsdom'],
      ['**', 'node'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['server/src/**', 'client/src/**', 'shared/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

- [ ] **Step 3: Run it**

```bash
npm test
```

Expected: 1 test passed.

- [ ] **Step 4: Delete the placeholder**

Delete `server/test/sample.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: configure vitest with node + jsdom envs and 80% coverage gate"
```

---

## Phase 1 — Shared schemas

### Task 3: Define shared Zod schemas

**Files:**
- Create: `shared/schemas.ts`
- Test: `shared/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

`shared/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  RECEIPT_TYPES,
  CURRENCIES,
  ReceiptCreateSchema,
  ListQuerySchema,
} from './schemas.js';

describe('ReceiptCreateSchema', () => {
  const valid = {
    documentName: 'AWS January',
    type: 'invoice' as const,
    invoiceDate: '2026-01-15',
    amount: 12500,
    currency: 'THB' as const,
    note: 'monthly bill',
  };

  it('accepts a complete valid payload', () => {
    expect(() => ReceiptCreateSchema.parse(valid)).not.toThrow();
  });

  it('accepts payload without optional note', () => {
    const { note: _omit, ...rest } = valid;
    expect(() => ReceiptCreateSchema.parse(rest)).not.toThrow();
  });

  it('rejects unknown type', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, type: 'bogus' })).toThrow();
  });

  it('rejects unknown currency', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, currency: 'GBP' })).toThrow();
  });

  it('rejects non-ISO invoiceDate', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, invoiceDate: '15/01/2026' })).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, amount: -1 })).toThrow();
  });

  it('rejects non-integer amount', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, amount: 1.5 })).toThrow();
  });

  it('rejects empty documentName', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, documentName: '' })).toThrow();
  });
});

describe('ListQuerySchema', () => {
  it('accepts empty query (all optional)', () => {
    expect(() => ListQuerySchema.parse({})).not.toThrow();
  });

  it('defaults page=1 and pageSize=20', () => {
    const parsed = ListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it('coerces page and pageSize from strings', () => {
    const parsed = ListQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it('rejects pageSize > 100', () => {
    expect(() => ListQuerySchema.parse({ pageSize: '500' })).toThrow();
  });
});

describe('constants', () => {
  it('exposes all four receipt types', () => {
    expect(RECEIPT_TYPES).toEqual(['invoice', 'receipt', 'quotation', 'other']);
  });

  it('exposes all five currencies', () => {
    expect(CURRENCIES).toEqual(['THB', 'USD', 'EUR', 'JPY', 'CNY']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- shared/schemas.test.ts
```

Expected: FAIL — `Cannot find module './schemas.js'`.

- [ ] **Step 3: Implement `shared/schemas.ts`**

```ts
import { z } from 'zod';

export const RECEIPT_TYPES = ['invoice', 'receipt', 'quotation', 'other'] as const;
export const CURRENCIES = ['THB', 'USD', 'EUR', 'JPY', 'CNY'] as const;

export type ReceiptType = (typeof RECEIPT_TYPES)[number];
export type Currency = (typeof CURRENCIES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const ReceiptCreateSchema = z.object({
  documentName: z.string().min(1).max(200),
  type: z.enum(RECEIPT_TYPES),
  invoiceDate: isoDate,
  amount: z.number().int().nonnegative(),
  currency: z.enum(CURRENCIES),
  note: z.string().max(2000).optional(),
});
export type ReceiptCreate = z.infer<typeof ReceiptCreateSchema>;

export const ReceiptDTOSchema = ReceiptCreateSchema.extend({
  id: z.string().uuid(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type ReceiptDTO = z.infer<typeof ReceiptDTOSchema>;

export const ListQuerySchema = z.object({
  type: z.enum(RECEIPT_TYPES).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- shared/schemas.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared/schemas.ts shared/schemas.test.ts
git commit -m "feat: add shared zod schemas for receipts, list query, and error envelope"
```

---

## Phase 2 — Server config and logger

### Task 4: Config module with Zod-validated env

**Files:**
- Create: `server/src/config.ts`
- Test: `server/test/config.test.ts`

- [ ] **Step 1: Write the failing tests**

`server/test/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('parses valid env', () => {
    const cfg = loadConfig({ PORT: '5900', DATA_DIR: '/data', NODE_ENV: 'production' });
    expect(cfg.port).toBe(5900);
    expect(cfg.dataDir).toBe('/data');
    expect(cfg.nodeEnv).toBe('production');
  });

  it('defaults PORT to 5900 and NODE_ENV to development', () => {
    const cfg = loadConfig({ DATA_DIR: '/data' });
    expect(cfg.port).toBe(5900);
    expect(cfg.nodeEnv).toBe('development');
  });

  it('throws if DATA_DIR is missing', () => {
    expect(() => loadConfig({})).toThrow(/DATA_DIR/);
  });

  it('throws if PORT is not a number', () => {
    expect(() => loadConfig({ DATA_DIR: '/data', PORT: 'abc' })).toThrow();
  });

  it('exposes derived paths', () => {
    const cfg = loadConfig({ DATA_DIR: '/x' });
    expect(cfg.dbPath).toBe('/x/db/receipts.db');
    expect(cfg.fileRoot).toBe('/x/file');
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

```bash
npm test -- server/test/config.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/src/config.ts`**

```ts
import { z } from 'zod';
import path from 'node:path';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5900),
  DATA_DIR: z.string().min(1, 'DATA_DIR is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export interface AppConfig {
  port: number;
  dataDir: string;
  nodeEnv: 'development' | 'test' | 'production';
  dbPath: string;
  fileRoot: string;
}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.parse(env);
  return {
    port: parsed.PORT,
    dataDir: parsed.DATA_DIR,
    nodeEnv: parsed.NODE_ENV,
    dbPath: path.posix.join(parsed.DATA_DIR, 'db', 'receipts.db'),
    fileRoot: path.posix.join(parsed.DATA_DIR, 'file'),
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- server/test/config.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/test/config.test.ts
git commit -m "feat(server): add config loader with zod-validated env"
```

---

### Task 5: Logger module

**Files:**
- Create: `server/src/logger.ts`

- [ ] **Step 1: Implement `server/src/logger.ts`**

(No test — pino is a third-party logger; configuration is the only behavior, and we'll verify it indirectly when boot logs appear in integration test output.)

```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'receipts' },
});
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
npx tsx -e "import('./server/src/logger.ts').then(m => console.log(typeof m.logger))"
```

Expected: prints `object`.

- [ ] **Step 3: Commit**

```bash
git add server/src/logger.ts
git commit -m "feat(server): add pino logger (silent in tests)"
```

---

## Phase 3 — Database

### Task 6: SQLite schema migration

**Files:**
- Create: `migrations/001_init.sql`

- [ ] **Step 1: Write the migration**

`migrations/001_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS receipts (
  id              TEXT PRIMARY KEY,
  document_name   TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('invoice','receipt','quotation','other')),
  invoice_date    TEXT NOT NULL,
  amount          INTEGER NOT NULL CHECK(amount >= 0),
  currency        TEXT NOT NULL CHECK(currency IN ('THB','USD','EUR','JPY','CNY')),
  note            TEXT,
  filename        TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receipts_invoice_date ON receipts(invoice_date);
CREATE INDEX IF NOT EXISTS idx_receipts_type         ON receipts(type);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at   ON receipts(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS receipts_fts USING fts5(
  document_name, note, content='receipts', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS receipts_ai AFTER INSERT ON receipts BEGIN
  INSERT INTO receipts_fts(rowid, document_name, note)
  VALUES (new.rowid, new.document_name, COALESCE(new.note, ''));
END;

CREATE TRIGGER IF NOT EXISTS receipts_ad AFTER DELETE ON receipts BEGIN
  INSERT INTO receipts_fts(receipts_fts, rowid, document_name, note)
  VALUES('delete', old.rowid, old.document_name, COALESCE(old.note, ''));
END;
```

(No standalone test — exercised by Task 7's migrations test.)

- [ ] **Step 2: Commit**

```bash
git add migrations/001_init.sql
git commit -m "feat(db): add initial schema with FTS5 mirror and triggers"
```

---

### Task 7: Connection + migrations runner

**Files:**
- Create: `server/src/db/connection.ts`
- Create: `server/src/db/migrations.ts`
- Test: `server/test/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

`server/test/migrations.test.ts`:

```ts
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
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table','virtual')",
    ).all() as { name: string }[];
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
```

- [ ] **Step 2: Run — verify fails**

```bash
npm test -- server/test/migrations.test.ts
```

- [ ] **Step 3: Implement `server/src/db/connection.ts`**

```ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

export function openDatabase(dbPath: string): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}
```

- [ ] **Step 4: Implement `server/src/db/migrations.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations');

export function runMigrations(db: DB, migrationsDir = MIGRATIONS_DIR): void {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const txn = db.transaction(() => {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      db.exec(sql);
    }
  });
  txn();
}
```

- [ ] **Step 5: Run tests, verify pass, commit**

```bash
npm test -- server/test/migrations.test.ts
git add server/src/db/connection.ts server/src/db/migrations.ts server/test/migrations.test.ts
git commit -m "feat(db): add connection helper and migration runner"
```

---

### Task 8: Receipts repository

**Files:**
- Create: `server/src/db/receiptsRepo.ts`
- Test: `server/test/receiptsRepo.test.ts`

- [ ] **Step 1: Write the failing test**

`server/test/receiptsRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createReceiptsRepo } from '../src/db/receiptsRepo.js';

const sample = {
  id: '11111111-1111-4111-8111-111111111111',
  documentName: 'AWS January',
  type: 'invoice' as const,
  invoiceDate: '2026-01-15',
  amount: 12500,
  currency: 'THB' as const,
  note: 'monthly',
  filename: '11111111-1111-4111-8111-111111111111.pdf',
  originalName: 'aws-jan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: '2026-01-15T10:00:00.000Z',
};

describe('receiptsRepo', () => {
  let tmpDir: string;
  let db: DB;
  let repo: ReturnType<typeof createReceiptsRepo>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
    db = openDatabase(path.join(tmpDir, 'test.db'));
    runMigrations(db);
    repo = createReceiptsRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('insert + getById roundtrip', () => {
    repo.insert(sample);
    const back = repo.getById(sample.id);
    expect(back).toMatchObject(sample);
  });

  it('getById returns null for unknown id', () => {
    expect(repo.getById('22222222-2222-4222-8222-222222222222')).toBeNull();
  });

  it('list returns most-recent first', () => {
    repo.insert({ ...sample, id: 'a'.repeat(8) + '-1111-4111-8111-111111111111', invoiceDate: '2026-01-01' });
    repo.insert({ ...sample, id: 'b'.repeat(8) + '-1111-4111-8111-111111111111', invoiceDate: '2026-03-01' });
    const { items, total } = repo.list({ page: 1, pageSize: 20 });
    expect(total).toBe(2);
    expect(items[0]?.invoiceDate).toBe('2026-03-01');
  });

  it('list filters by type', () => {
    repo.insert({ ...sample, id: 'c'.repeat(8) + '-1111-4111-8111-111111111111', type: 'receipt' });
    repo.insert({ ...sample, id: 'd'.repeat(8) + '-1111-4111-8111-111111111111', type: 'invoice' });
    const { total } = repo.list({ type: 'invoice', page: 1, pageSize: 20 });
    expect(total).toBe(1);
  });

  it('list filters by date range', () => {
    repo.insert({ ...sample, id: 'e'.repeat(8) + '-1111-4111-8111-111111111111', invoiceDate: '2026-01-01' });
    repo.insert({ ...sample, id: 'f'.repeat(8) + '-1111-4111-8111-111111111111', invoiceDate: '2026-06-01' });
    const { total } = repo.list({ dateFrom: '2026-03-01', dateTo: '2026-12-31', page: 1, pageSize: 20 });
    expect(total).toBe(1);
  });

  it('list searches FTS by q', () => {
    repo.insert({ ...sample, id: 'a1'.padEnd(8, '0') + '-1111-4111-8111-111111111111', documentName: 'AWS January' });
    repo.insert({ ...sample, id: 'a2'.padEnd(8, '0') + '-1111-4111-8111-111111111111', documentName: 'GitHub bill' });
    const { items, total } = repo.list({ q: 'AWS', page: 1, pageSize: 20 });
    expect(total).toBe(1);
    expect(items[0]?.documentName).toBe('AWS January');
  });

  it('list paginates', () => {
    for (let i = 0; i < 25; i++) {
      repo.insert({ ...sample, id: i.toString().padStart(8, '0') + '-1111-4111-8111-111111111111' });
    }
    const { items, total } = repo.list({ page: 2, pageSize: 10 });
    expect(total).toBe(25);
    expect(items).toHaveLength(10);
  });

  it('delete removes row and FTS entry', () => {
    repo.insert(sample);
    expect(repo.delete(sample.id)).toBe(true);
    expect(repo.getById(sample.id)).toBeNull();
    const { total } = repo.list({ q: 'AWS', page: 1, pageSize: 20 });
    expect(total).toBe(0);
  });

  it('delete returns false for unknown id', () => {
    expect(repo.delete('99999999-9999-4999-8999-999999999999')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
npm test -- server/test/receiptsRepo.test.ts
```

- [ ] **Step 3: Implement `server/src/db/receiptsRepo.ts`**

```ts
import type { DB } from './connection.js';
import type { ReceiptDTO, ReceiptType, Currency, ListQuery } from '@shared/schemas.js';

interface ReceiptRow {
  id: string;
  document_name: string;
  type: ReceiptType;
  invoice_date: string;
  amount: number;
  currency: Currency;
  note: string | null;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

function rowToDTO(r: ReceiptRow): ReceiptDTO {
  return {
    id: r.id,
    documentName: r.document_name,
    type: r.type,
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
  items: ReceiptDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export function createReceiptsRepo(db: DB) {
  const insertStmt = db.prepare(`
    INSERT INTO receipts (
      id, document_name, type, invoice_date, amount, currency, note,
      filename, original_name, mime_type, size_bytes, created_at
    ) VALUES (
      @id, @documentName, @type, @invoiceDate, @amount, @currency, @note,
      @filename, @originalName, @mimeType, @sizeBytes, @createdAt
    )
  `);

  const getStmt = db.prepare(`SELECT * FROM receipts WHERE id = ?`);
  const deleteStmt = db.prepare(`DELETE FROM receipts WHERE id = ?`);

  function buildListSQL(q: ListQuery): { sql: string; countSQL: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    let fromClause = 'FROM receipts r';
    let orderBy = 'ORDER BY r.invoice_date DESC, r.created_at DESC';

    if (q.q) {
      fromClause += ' JOIN receipts_fts f ON f.rowid = r.rowid';
      where.push('f.receipts_fts MATCH ?');
      params.push(`${q.q.replace(/["*]/g, '')}*`);
      orderBy = 'ORDER BY bm25(receipts_fts)';
    }
    if (q.type) {
      where.push('r.type = ?');
      params.push(q.type);
    }
    if (q.dateFrom) {
      where.push('r.invoice_date >= ?');
      params.push(q.dateFrom);
    }
    if (q.dateTo) {
      where.push('r.invoice_date <= ?');
      params.push(q.dateTo);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT r.* ${fromClause} ${whereClause} ${orderBy} LIMIT ? OFFSET ?`;
    const countSQL = `SELECT COUNT(*) AS c ${fromClause} ${whereClause}`;
    return { sql, countSQL, params };
  }

  return {
    insert(dto: ReceiptDTO): void {
      insertStmt.run({
        id: dto.id,
        documentName: dto.documentName,
        type: dto.type,
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

    getById(id: string): ReceiptDTO | null {
      const row = getStmt.get(id) as ReceiptRow | undefined;
      return row ? rowToDTO(row) : null;
    },

    list(q: ListQuery): ListResult {
      const { sql, countSQL, params } = buildListSQL(q);
      const offset = (q.page - 1) * q.pageSize;
      const rows = db.prepare(sql).all(...params, q.pageSize, offset) as ReceiptRow[];
      const total = (db.prepare(countSQL).get(...params) as { c: number }).c;
      return { items: rows.map(rowToDTO), total, page: q.page, pageSize: q.pageSize };
    },

    delete(id: string): boolean {
      const info = deleteStmt.run(id);
      return info.changes > 0;
    },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm test -- server/test/receiptsRepo.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/db/receiptsRepo.ts server/test/receiptsRepo.test.ts
git commit -m "feat(db): add receipts repository with FTS5 search and filtering"
```

---

## Phase 4 — File storage

### Task 9: File store module

**Files:**
- Create: `server/src/storage/fileStore.ts`
- Test: `server/test/fileStore.test.ts`

- [ ] **Step 1: Write the failing test**

`server/test/fileStore.test.ts`:

```ts
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

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('derives YYYY/MM/uuid.ext path from invoiceDate', () => {
    const p = store.derivePath('aaaa1111-2222-4333-8444-555566667777', 'pdf', '2026-03-15');
    expect(p).toMatch(/2026[\\/]03[\\/]aaaa1111-2222-4333-8444-555566667777\.pdf$/);
  });

  it('writes bytes and creates the directory tree', async () => {
    await store.write('11111111-1111-4111-8111-111111111111', 'png', '2026-01-10', Buffer.from('hi'));
    const written = fs.readFileSync(path.join(root, '2026', '01', '11111111-1111-4111-8111-111111111111.png'));
    expect(written.toString()).toBe('hi');
  });

  it('openStream reads back what was written', async () => {
    await store.write('22222222-2222-4222-8222-222222222222', 'jpg', '2026-02-01', Buffer.from('hello'));
    const stream = store.openStream('22222222-2222-4222-8222-222222222222', 'jpg', '2026-02-01');
    const chunks: Buffer[] = [];
    for await (const chunk of stream as Readable) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('hello');
  });

  it('exists returns false for missing files', () => {
    expect(store.exists('99999999-9999-4999-8999-999999999999', 'pdf', '2026-01-01')).toBe(false);
  });

  it('unlink removes the file', async () => {
    await store.write('33333333-3333-4333-8333-333333333333', 'pdf', '2026-04-01', Buffer.from('x'));
    await store.unlink('33333333-3333-4333-8333-333333333333', 'pdf', '2026-04-01');
    expect(store.exists('33333333-3333-4333-8333-333333333333', 'pdf', '2026-04-01')).toBe(false);
  });

  it('unlink does not throw if file already missing', async () => {
    await expect(
      store.unlink('44444444-4444-4444-8444-444444444444', 'pdf', '2026-04-01'),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify fails**

- [ ] **Step 3: Implement `server/src/storage/fileStore.ts`**

```ts
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';

export function createFileStore(root: string) {
  function derivePath(id: string, ext: string, invoiceDate: string): string {
    const year = invoiceDate.slice(0, 4);
    const month = invoiceDate.slice(5, 7);
    return path.join(root, year, month, `${id}.${ext}`);
  }

  async function write(id: string, ext: string, invoiceDate: string, bytes: Buffer): Promise<void> {
    const full = derivePath(id, ext, invoiceDate);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, bytes);
  }

  function openStream(id: string, ext: string, invoiceDate: string): NodeJS.ReadableStream {
    return createReadStream(derivePath(id, ext, invoiceDate));
  }

  function exists(id: string, ext: string, invoiceDate: string): boolean {
    return fs.existsSync(derivePath(id, ext, invoiceDate));
  }

  async function unlink(id: string, ext: string, invoiceDate: string): Promise<void> {
    try {
      await fsp.unlink(derivePath(id, ext, invoiceDate));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
    }
  }

  return { derivePath, write, openStream, exists, unlink };
}

export type FileStore = ReturnType<typeof createFileStore>;
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add server/src/storage/fileStore.ts server/test/fileStore.test.ts
git commit -m "feat(storage): add file store with date-partitioned paths"
```

---

## Phase 5 — Express app, middleware, routes

### Task 10: Error envelope + error handler middleware

**Files:**
- Create: `server/src/middleware/errorHandler.ts`
- Test: `server/test/errorHandler.test.ts`

- [ ] **Step 1: Write failing test**

`server/test/errorHandler.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ApiError, errorHandler } from '../src/middleware/errorHandler.js';
import { z } from 'zod';

function buildApp(routeFn: express.RequestHandler) {
  const app = express();
  app.get('/x', routeFn);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('translates ApiError to envelope', async () => {
    const app = buildApp((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'gone')));
    const res = await request(app).get('/x');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'gone' } });
  });

  it('translates ZodError to 400 VALIDATION with fields', async () => {
    const schema = z.object({ a: z.number() });
    const app = buildApp((_req, _res, next) => {
      try {
        schema.parse({ a: 'no' });
      } catch (err) {
        next(err);
      }
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.fields).toHaveProperty('a');
  });

  it('falls back to 500 INTERNAL for unknown errors', async () => {
    const app = buildApp((_req, _res, next) => next(new Error('boom')));
    const res = await request(app).get('/x');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
  });
});
```

- [ ] **Step 2: Run — verify fails**

- [ ] **Step 3: Implement `server/src/middleware/errorHandler.ts`**

```ts
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) },
    });
    return;
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] = issue.message;
    }
    res.status(400).json({
      error: { code: 'VALIDATION', message: 'Invalid request', fields },
    });
    return;
  }
  logger.error({ err }, 'unexpected error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
};
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/errorHandler.ts server/test/errorHandler.test.ts
git commit -m "feat(server): add ApiError class and error handler middleware"
```

---

### Task 11: Upload middleware (multer + file-type sniff)

**Files:**
- Create: `server/src/middleware/upload.ts`

- [ ] **Step 1: Implement `server/src/middleware/upload.ts`**

(No standalone unit test — exercised by integration tests in Task 13. We avoid mocking file-type and multer.)

```ts
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { ApiError } from './errorHandler.js';

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
export const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

export async function sniffOrThrow(buf: Buffer): Promise<{ mime: string; ext: string }> {
  const detected = await fileTypeFromBuffer(buf);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'File must be PDF, JPG, or PNG');
  }
  return { mime: detected.mime, ext: EXT_BY_MIME[detected.mime]! };
}

export function multerErrorAsApiError(err: unknown): ApiError | null {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(413, 'FILE_TOO_LARGE', 'File exceeds 25 MB');
    }
    return new ApiError(400, 'VALIDATION', err.message);
  }
  return null;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc -p tsconfig.server.json --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/upload.ts
git commit -m "feat(server): add upload middleware with byte-sniff validation"
```

---

### Task 12: Health route

**Files:**
- Create: `server/src/routes/health.ts`

- [ ] **Step 1: Implement `server/src/routes/health.ts`**

```ts
import { Router } from 'express';

export function healthRouter(): Router {
  const r = Router();
  r.get('/', (_req, res) => {
    res.json({ ok: true, version: process.env.APP_VERSION ?? 'dev' });
  });
  return r;
}
```

(Tested in the integration suite alongside the receipts routes.)

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/health.ts
git commit -m "feat(server): add /api/health route"
```

---

### Task 13: Receipts routes + app wiring

**Files:**
- Create: `server/src/routes/receipts.ts`
- Create: `server/src/app.ts`
- Create: `server/test/helpers.ts`
- Test: `server/test/upload.test.ts`
- Test: `server/test/list.test.ts`
- Test: `server/test/detail-and-download.test.ts`
- Test: `server/test/delete.test.ts`

- [ ] **Step 1: Write integration test helpers**

`server/test/helpers.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { type Express } from 'express';
import { buildApp } from '../src/app.js';
import { openDatabase, type DB } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { createReceiptsRepo } from '../src/db/receiptsRepo.js';
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

export function makeTestEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-it-'));
  fs.mkdirSync(path.join(tmp, 'db'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'file'), { recursive: true });
  const db: DB = openDatabase(path.join(tmp, 'db', 'receipts.db'));
  runMigrations(db);
  const repo = createReceiptsRepo(db);
  const store = createFileStore(path.join(tmp, 'file'));
  const app: Express = buildApp({ repo, store });
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

- [ ] **Step 2: Write upload integration tests**

`server/test/upload.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('POST /api/receipts', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  const validMeta = {
    documentName: 'Test',
    type: 'invoice' as const,
    invoiceDate: '2026-01-15',
    amount: 100,
    currency: 'THB' as const,
  };

  it('uploads PDF, returns 201 with DTO, writes file at YYYY/MM/uuid.pdf', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify(validMeta))
      .attach('file', env.fixtures.PDF_MIN, 'test.pdf');
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.mimeType).toBe('application/pdf');
    expect(res.body.originalName).toBe('test.pdf');

    const onDisk = path.join(env.tmp, 'file', '2026', '01', `${res.body.id}.pdf`);
    expect(fs.existsSync(onDisk)).toBe(true);
  });

  it('uploads PNG with image/png mime', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify(validMeta))
      .attach('file', env.fixtures.PNG_1x1, 'small.png');
    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe('image/png');
  });

  it('rejects missing metadata', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .attach('file', env.fixtures.PDF_MIN, 'test.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('rejects bad metadata JSON', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', '{not json')
      .attach('file', env.fixtures.PDF_MIN, 'test.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('rejects metadata that fails schema', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify({ ...validMeta, type: 'bogus' }))
      .attach('file', env.fixtures.PDF_MIN, 'test.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.fields.type).toBeTruthy();
  });

  it('rejects missing file', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify(validMeta));
    expect(res.status).toBe(400);
  });

  it('rejects file that fails byte-sniff', async () => {
    const res = await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify(validMeta))
      .attach('file', Buffer.from('not a real file'), 'fake.pdf');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('writes no DB row if the upload is rejected (atomicity)', async () => {
    await request(env.app)
      .post('/api/receipts')
      .field('metadata', JSON.stringify(validMeta))
      .attach('file', Buffer.from('garbage'), 'fake.pdf');
    const { total } = env.repo.list({ page: 1, pageSize: 10 });
    expect(total).toBe(0);
  });
});
```

- [ ] **Step 3: Write list integration tests**

`server/test/list.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { makeTestEnv } from './helpers.js';

const meta = (overrides: Record<string, unknown> = {}) => ({
  documentName: 'Doc',
  type: 'invoice',
  invoiceDate: '2026-01-15',
  amount: 100,
  currency: 'THB',
  ...overrides,
});

async function uploadOne(env: ReturnType<typeof makeTestEnv>, overrides: Record<string, unknown> = {}) {
  return request(env.app)
    .post('/api/receipts')
    .field('metadata', JSON.stringify(meta(overrides)))
    .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
}

describe('GET /api/receipts', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  it('returns empty list initially', async () => {
    const res = await request(env.app).get('/api/receipts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('lists most-recent invoiceDate first', async () => {
    await uploadOne(env, { invoiceDate: '2026-01-01', documentName: 'Old' });
    await uploadOne(env, { invoiceDate: '2026-03-01', documentName: 'New' });
    const res = await request(env.app).get('/api/receipts');
    expect(res.body.items[0].documentName).toBe('New');
  });

  it('filters by type', async () => {
    await uploadOne(env, { type: 'invoice' });
    await uploadOne(env, { type: 'receipt' });
    const res = await request(env.app).get('/api/receipts?type=invoice');
    expect(res.body.total).toBe(1);
  });

  it('filters by date range', async () => {
    await uploadOne(env, { invoiceDate: '2026-01-01' });
    await uploadOne(env, { invoiceDate: '2026-06-01' });
    const res = await request(env.app).get('/api/receipts?dateFrom=2026-03-01&dateTo=2026-12-31');
    expect(res.body.total).toBe(1);
  });

  it('full-text search via q', async () => {
    await uploadOne(env, { documentName: 'AWS January' });
    await uploadOne(env, { documentName: 'GitHub bill' });
    const res = await request(env.app).get('/api/receipts?q=AWS');
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].documentName).toBe('AWS January');
  });

  it('paginates', async () => {
    for (let i = 0; i < 25; i++) await uploadOne(env, { documentName: `Doc ${i}` });
    const res = await request(env.app).get('/api/receipts?page=2&pageSize=10');
    expect(res.body.total).toBe(25);
    expect(res.body.items).toHaveLength(10);
  });

  it('400s on invalid pageSize', async () => {
    const res = await request(env.app).get('/api/receipts?pageSize=500');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Write detail and download integration tests**

`server/test/detail-and-download.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('GET /api/receipts/:id and :id/file', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  async function uploadAndGetId(): Promise<string> {
    const res = await request(env.app)
      .post('/api/receipts')
      .field(
        'metadata',
        JSON.stringify({
          documentName: 'D',
          type: 'invoice',
          invoiceDate: '2026-01-15',
          amount: 1,
          currency: 'THB',
        }),
      )
      .attach('file', env.fixtures.PDF_MIN, 'orig.pdf');
    return res.body.id;
  }

  it('returns metadata for an existing receipt', async () => {
    const id = await uploadAndGetId();
    const res = await request(env.app).get(`/api/receipts/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('404 for unknown id', async () => {
    const res = await request(env.app).get('/api/receipts/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('streams file with Content-Disposition', async () => {
    const id = await uploadAndGetId();
    const res = await request(env.app).get(`/api/receipts/${id}/file`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/orig\.pdf/);
    expect(res.body.length).toBe(env.fixtures.PDF_MIN.length);
  });

  it('returns 410 FILE_GONE if DB row exists but file is missing', async () => {
    const id = await uploadAndGetId();
    const dto = env.repo.getById(id)!;
    fs.unlinkSync(path.join(env.tmp, 'file', '2026', '01', dto.filename));
    const res = await request(env.app).get(`/api/receipts/${id}/file`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('FILE_GONE');
  });
});
```

- [ ] **Step 5: Write delete integration tests**

`server/test/delete.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestEnv } from './helpers.js';

describe('DELETE /api/receipts/:id', () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });
  afterEach(() => env.cleanup());

  async function uploadAndGetId(): Promise<string> {
    const res = await request(env.app)
      .post('/api/receipts')
      .field(
        'metadata',
        JSON.stringify({
          documentName: 'D',
          type: 'invoice',
          invoiceDate: '2026-01-15',
          amount: 1,
          currency: 'THB',
        }),
      )
      .attach('file', env.fixtures.PDF_MIN, 'x.pdf');
    return res.body.id;
  }

  it('removes row and file', async () => {
    const id = await uploadAndGetId();
    const dto = env.repo.getById(id)!;
    const res = await request(env.app).delete(`/api/receipts/${id}`);
    expect(res.status).toBe(204);
    expect(env.repo.getById(id)).toBeNull();
    expect(fs.existsSync(path.join(env.tmp, 'file', '2026', '01', dto.filename))).toBe(false);
  });

  it('returns 204 even if the file is already gone (orphan tolerance)', async () => {
    const id = await uploadAndGetId();
    const dto = env.repo.getById(id)!;
    fs.unlinkSync(path.join(env.tmp, 'file', '2026', '01', dto.filename));
    const res = await request(env.app).delete(`/api/receipts/${id}`);
    expect(res.status).toBe(204);
    expect(env.repo.getById(id)).toBeNull();
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(env.app).delete('/api/receipts/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('also drops the FTS index entry', async () => {
    const id = await uploadAndGetId();
    await request(env.app).delete(`/api/receipts/${id}`);
    const search = await request(env.app).get('/api/receipts?q=D');
    expect(search.body.total).toBe(0);
  });
});
```

- [ ] **Step 6: Run all four — verify they fail**

```bash
npm test -- server/test
```

Expected: FAIL — `buildApp` and routes don't exist yet.

- [ ] **Step 7: Implement `server/src/routes/receipts.ts`**

```ts
import { Router, type Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import {
  ReceiptCreateSchema,
  ListQuerySchema,
  type ReceiptDTO,
} from '@shared/schemas.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  uploadMiddleware,
  sniffOrThrow,
  multerErrorAsApiError,
  EXT_BY_MIME,
} from '../middleware/upload.js';
import type { createReceiptsRepo } from '../db/receiptsRepo.js';
import type { FileStore } from '../storage/fileStore.js';

interface Deps {
  repo: ReturnType<typeof createReceiptsRepo>;
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

export function receiptsRouter(deps: Deps): Router {
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
        const meta = ReceiptCreateSchema.parse(rawMeta);

        const { mime, ext } = await sniffOrThrow(file.buffer);

        const id = uuidv4();
        const now = new Date().toISOString();
        const filename = `${id}.${ext}`;

        await store.write(id, ext, meta.invoiceDate, file.buffer);

        const dto: ReceiptDTO = {
          id,
          ...meta,
          filename,
          originalName: file.originalname,
          mimeType: mime,
          sizeBytes: file.size,
          createdAt: now,
        };

        try {
          repo.insert(dto);
        } catch (e) {
          await store.unlink(id, ext, meta.invoiceDate);
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
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'receipt not found');
      res.json(dto);
    } catch (e) {
      next(e);
    }
  });

  r.get('/:id/file', (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      const dto = repo.getById(id);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'receipt not found');
      const ext = path.extname(dto.filename).slice(1);
      if (!store.exists(id, ext, dto.invoiceDate)) {
        throw new ApiError(410, 'FILE_GONE', 'file is no longer in storage');
      }
      res.setHeader('Content-Type', dto.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${dto.originalName.replace(/"/g, '')}"`,
      );
      store.openStream(id, ext, dto.invoiceDate).pipe(res);
    } catch (e) {
      next(e);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      const dto = repo.getById(id);
      if (!dto) throw new ApiError(404, 'NOT_FOUND', 'receipt not found');
      const ext = path.extname(dto.filename).slice(1);
      repo.delete(id);
      await store.unlink(id, ext, dto.invoiceDate);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
```

- [ ] **Step 8: Implement `server/src/app.ts`**

```ts
import express, { type Express } from 'express';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { receiptsRouter } from './routes/receipts.js';
import { healthRouter } from './routes/health.js';
import type { createReceiptsRepo } from './db/receiptsRepo.js';
import type { FileStore } from './storage/fileStore.js';

export interface AppDeps {
  repo: ReturnType<typeof createReceiptsRepo>;
  store: FileStore;
  staticDir?: string;
}

export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use('/api/health', healthRouter());
  app.use('/api/receipts', receiptsRouter(deps));
  if (deps.staticDir) {
    app.use(express.static(deps.staticDir));
    app.get('*', (_req, res) => res.sendFile('index.html', { root: deps.staticDir }));
  }
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 9: Run all integration tests, verify pass**

```bash
npm test -- server/test
```

- [ ] **Step 10: Commit**

```bash
git add server/src/routes/receipts.ts server/src/app.ts server/test/helpers.ts server/test/upload.test.ts server/test/list.test.ts server/test/detail-and-download.test.ts server/test/delete.test.ts
git commit -m "feat(server): wire express app with receipts CRUD, search, and download"
```

---

### Task 14: Server boot (`index.ts`) with fail-fast checks

**Files:**
- Create: `server/src/index.ts`

- [ ] **Step 1: Implement `server/src/index.ts`**

(No unit test — the boot path is exercised by Task 23's Docker smoke test and by manual `npm run start`.)

```ts
import fs from 'node:fs';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrations.js';
import { createReceiptsRepo } from './db/receiptsRepo.js';
import { createFileStore } from './storage/fileStore.js';
import { buildApp } from './app.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const repo = createReceiptsRepo(db);
  const store = createFileStore(cfg.fileRoot);

  const staticDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../client/dist',
  );
  const app = buildApp({
    repo,
    store,
    staticDir: fs.existsSync(staticDir) ? staticDir : undefined,
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

- [ ] **Step 2: Smoke test the boot path locally**

In a separate terminal:

```bash
mkdir -p /tmp/receipts-smoke
DATA_DIR=/tmp/receipts-smoke npm run dev:server
```

In another terminal:

```bash
curl http://localhost:5900/api/health
```

Expected: `{"ok":true,"version":"dev"}`. Then Ctrl+C the dev server.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): boot with fail-fast writable check and signal handlers"
```

---

## Phase 6 — React client

### Task 15: Vite + React scaffolding

**Files:**
- Create: `vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/types.ts`

- [ ] **Step 1: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'shared') },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5900' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 2: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Inhouse Document Management</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `client/src/types.ts`**

```ts
export * from '@shared/schemas.js';
```

- [ ] **Step 4: Create `client/src/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 5: Create `client/src/App.tsx` (router shell — pages stubbed)**

```tsx
import { Routes, Route, NavLink } from 'react-router-dom';

function Placeholder({ name }: { name: string }) {
  return <div style={{ padding: 16 }}>{name} (not yet implemented)</div>;
}

export function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: 12, borderBottom: '1px solid #ddd', display: 'flex', gap: 16 }}>
        <strong>Receipts</strong>
        <NavLink to="/">Upload</NavLink>
        <NavLink to="/browse">Browse</NavLink>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Placeholder name="Upload" />} />
          <Route path="/browse" element={<Placeholder name="Browse" />} />
          <Route path="/receipts/:id" element={<Placeholder name="Detail" />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Verify dev build runs**

```bash
npm run build:client
```

Expected: `client/dist/index.html` exists.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts client/index.html client/src/main.tsx client/src/App.tsx client/src/types.ts
git commit -m "feat(client): scaffold vite + react router shell"
```

---

### Task 16: API client (`api.ts`) with DB_BUSY retry

**Files:**
- Create: `client/src/api.ts`
- Test: `client/src/api.test.ts`

- [ ] **Step 1: Write failing test**

`client/src/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './api.js';

declare global {
  // eslint-disable-next-line no-var
  var fetch: typeof globalThis.fetch;
}

function mockResponses(...responses: Array<Partial<Response> & { jsonBody?: unknown }>) {
  let i = 0;
  global.fetch = vi.fn(async () => {
    const r = responses[i++] ?? responses[responses.length - 1]!;
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.jsonBody,
      blob: async () => new Blob(['x']),
    } as unknown as Response;
  });
}

describe('api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('list resolves with body', async () => {
    mockResponses({ status: 200, jsonBody: { items: [], total: 0, page: 1, pageSize: 20 } });
    const res = await api.list({});
    expect(res.total).toBe(0);
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

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement `client/src/api.ts`**

```ts
import type { ReceiptCreate, ReceiptDTO, ListQuery } from './types.js';

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
    const body = await res.clone().json().catch(() => null);
    if (body?.error?.code === 'DB_BUSY') {
      await new Promise((r) => setTimeout(r, 250));
      res = await doFetch();
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: 'INTERNAL', message: res.statusText } }));
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
  if (q.dateFrom) sp.set('dateFrom', q.dateFrom);
  if (q.dateTo) sp.set('dateTo', q.dateTo);
  if (q.q) sp.set('q', q.q);
  if (q.page) sp.set('page', String(q.page));
  if (q.pageSize) sp.set('pageSize', String(q.pageSize));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  async upload(file: File, meta: ReceiptCreate): Promise<ReceiptDTO> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('metadata', JSON.stringify(meta));
    return request<ReceiptDTO>('/api/receipts', { method: 'POST', body: fd });
  },

  async list(q: Partial<ListQuery>) {
    return request<{ items: ReceiptDTO[]; total: number; page: number; pageSize: number }>(
      `/api/receipts${buildQuery(q)}`,
    );
  },

  async getById(id: string): Promise<ReceiptDTO> {
    return request<ReceiptDTO>(`/api/receipts/${id}`);
  },

  fileUrl(id: string): string {
    return `/api/receipts/${id}/file`;
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/receipts/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({ error: { code: 'INTERNAL', message: '' } }));
      throw new ApiClientError(body.error.code, body.error.message);
    }
  },
};
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add client/src/api.ts client/src/api.test.ts
git commit -m "feat(client): add api client with DB_BUSY single-retry"
```

---

### Task 17: Dropzone component

**Files:**
- Create: `client/src/components/Dropzone.tsx`
- Test: `client/src/components/Dropzone.test.tsx`

- [ ] **Step 1: Write failing test**

`client/src/components/Dropzone.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dropzone } from './Dropzone.js';

describe('Dropzone', () => {
  it('renders prompt text', () => {
    render(<Dropzone onFile={() => {}} />);
    expect(screen.getByText(/Drag & drop/i)).toBeTruthy();
  });

  it('calls onFile when a file is dropped', () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const zone = screen.getByTestId('dropzone');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('rejects files with disallowed extensions', () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const file = new File(['x'], 'a.exe', { type: 'application/x-msdownload' });
    const zone = screen.getByTestId('dropzone');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/Only PDF, JPG, PNG/i)).toBeTruthy();
  });
});
```

Also add `@testing-library/react` and `@testing-library/jest-dom` deps:

```bash
npm install -D @testing-library/react @testing-library/jest-dom
```

Add test setup to `vitest.config.ts` `test` block:

```ts
setupFiles: ['./vitest.setup.ts'],
```

Create `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement `client/src/components/Dropzone.tsx`**

```tsx
import { useRef, useState } from 'react';

const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'];

export function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    const file = files[0]!;
    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
      setError('Only PDF, JPG, PNG accepted');
      return;
    }
    onFile(file);
  }

  return (
    <div>
      <div
        data-testid="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: '2px dashed #aaa',
          borderRadius: 8,
          padding: 32,
          textAlign: 'center',
          background: '#fafafa',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.5 }}>📄</div>
        <p>Drag &amp; drop receipt here</p>
        <p style={{ fontSize: 13, opacity: 0.6 }}>or click to browse — PDF, JPG, PNG</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p style={{ color: '#c00' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Dropzone.tsx client/src/components/Dropzone.test.tsx vitest.setup.ts vitest.config.ts package.json package-lock.json
git commit -m "feat(client): add Dropzone component with extension validation"
```

---

### Task 18: UploadPage

**Files:**
- Create: `client/src/pages/UploadPage.tsx`
- Modify: `client/src/App.tsx` (replace UploadPage placeholder)

- [ ] **Step 1: Implement `client/src/pages/UploadPage.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropzone } from '../components/Dropzone.js';
import { api } from '../api.js';
import { RECEIPT_TYPES, CURRENCIES, type ReceiptCreate } from '../types.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

export function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    documentName: '',
    type: 'invoice' as (typeof RECEIPT_TYPES)[number],
    invoiceDate: todayISO(),
    amountMajor: '',
    currency: 'THB' as (typeof CURRENCIES)[number],
    note: '',
  });

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
    const amountNum = Number(form.amountMajor);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      setFieldErrors({ amountMajor: 'Must be a positive number' });
      return;
    }
    const meta: ReceiptCreate = {
      documentName: form.documentName,
      type: form.type,
      invoiceDate: form.invoiceDate,
      amount: Math.round(amountNum * 100),
      currency: form.currency,
      note: form.note || undefined,
    };
    setSubmitting(true);
    try {
      const dto = await api.upload(file, meta);
      navigate(`/receipts/${dto.id}`);
    } catch (err) {
      const e = err as { code?: string; message?: string; fields?: Record<string, string> };
      if (e.fields) setFieldErrors(e.fields);
      setServerError(e.message ?? 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 600, margin: '24px auto', padding: 16 }}>
      <h2>Upload Receipt</h2>

      {file ? (
        <div style={{ padding: 12, background: '#eef', borderRadius: 6 }}>
          Selected: <strong>{file.name}</strong>{' '}
          <button type="button" onClick={() => setFile(null)}>
            Change
          </button>
        </div>
      ) : (
        <Dropzone onFile={setFile} />
      )}

      <label>Document Name</label>
      <input
        value={form.documentName}
        onChange={(e) => update('documentName', e.target.value)}
        required
        style={{ width: '100%' }}
      />
      {fieldErrors.documentName && <p style={{ color: '#c00' }}>{fieldErrors.documentName}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label>Type</label>
          <select value={form.type} onChange={(e) => update('type', e.target.value as typeof form.type)}>
            {RECEIPT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Invoice Date</label>
          <input
            type="date"
            value={form.invoiceDate}
            onChange={(e) => update('invoiceDate', e.target.value)}
            required
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div>
          <label>Amount</label>
          <input
            value={form.amountMajor}
            onChange={(e) => update('amountMajor', e.target.value)}
            placeholder="0.00"
            required
          />
          {fieldErrors.amountMajor && <p style={{ color: '#c00' }}>{fieldErrors.amountMajor}</p>}
        </div>
        <div>
          <label>Currency</label>
          <select
            value={form.currency}
            onChange={(e) => update('currency', e.target.value as typeof form.currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label>Additional Note</label>
      <textarea
        value={form.note}
        onChange={(e) => update('note', e.target.value)}
        rows={3}
        style={{ width: '100%' }}
      />

      {serverError && <p style={{ color: '#c00' }}>{serverError}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
        <button type="button" onClick={() => navigate('/browse')}>
          Cancel
        </button>
        <button type="submit" disabled={submitting || !file}>
          {submitting ? 'Uploading…' : 'Upload to NAS'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Wire route in `client/src/App.tsx`**

Replace the file with:

```tsx
import { Routes, Route, NavLink } from 'react-router-dom';
import { UploadPage } from './pages/UploadPage.js';

function Placeholder({ name }: { name: string }) {
  return <div style={{ padding: 16 }}>{name} (not yet implemented)</div>;
}

export function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: 12, borderBottom: '1px solid #ddd', display: 'flex', gap: 16 }}>
        <strong>Receipts</strong>
        <NavLink to="/">Upload</NavLink>
        <NavLink to="/browse">Browse</NavLink>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/browse" element={<Placeholder name="Browse" />} />
          <Route path="/receipts/:id" element={<Placeholder name="Detail" />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build:client
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/UploadPage.tsx client/src/App.tsx
git commit -m "feat(client): add UploadPage with file pick, metadata form, and error display"
```

---

### Task 19: BrowsePage (list + filter + search + pagination)

**Files:**
- Create: `client/src/pages/BrowsePage.tsx`
- Modify: `client/src/App.tsx` (wire route)

- [ ] **Step 1: Implement `client/src/pages/BrowsePage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { RECEIPT_TYPES, type ReceiptDTO, type ReceiptType } from '../types.js';

export function BrowsePage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<ReceiptType | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [items, setItems] = useState<ReceiptDTO[]>([]);
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
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
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
  }, [q, type, dateFrom, dateTo, page]);

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
      <aside>
        <h3>Filter</h3>
        <label>Search</label>
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <label>Type</label>
        <select value={type} onChange={(e) => { setType(e.target.value as ReceiptType | ''); setPage(1); }}>
          <option value="">All</option>
          {RECEIPT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label>From</label>
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
        <label>To</label>
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
      </aside>
      <section>
        <h3>Receipts ({total})</h3>
        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#c00' }}>{error}</p>}
        {!loading && items.length === 0 && <p>No receipts yet. <Link to="/">Upload one</Link>.</p>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Name</th>
              <th align="left">Type</th>
              <th align="left">Date</th>
              <th align="right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{r.documentName}</td>
                <td>{r.type}</td>
                <td>{r.invoiceDate}</td>
                <td align="right">{(r.amount / 100).toFixed(2)} {r.currency}</td>
                <td><Link to={`/receipts/${r.id}`}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {page} / {lastPage}</span>
          <button disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Wire route in `client/src/App.tsx`**

Replace `<Placeholder name="Browse" />` with `<BrowsePage />` and add the import:

```tsx
import { BrowsePage } from './pages/BrowsePage.js';
```

- [ ] **Step 3: Verify build**

```bash
npm run build:client
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/BrowsePage.tsx client/src/App.tsx
git commit -m "feat(client): add BrowsePage with filter, search, and pagination"
```

---

### Task 20: ReceiptDetailPage (view + download + delete)

**Files:**
- Create: `client/src/pages/ReceiptDetailPage.tsx`
- Modify: `client/src/App.tsx` (wire route)

- [ ] **Step 1: Implement `client/src/pages/ReceiptDetailPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import type { ReceiptDTO } from '../types.js';

export function ReceiptDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [dto, setDto] = useState<ReceiptDTO | null>(null);
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
    if (!confirm('Delete this receipt? This cannot be undone.')) return;
    try {
      await api.remove(id);
      navigate('/browse');
    } catch (e) {
      setError((e as { message: string }).message);
    }
  }

  if (loading) return <p style={{ padding: 16 }}>Loading…</p>;
  if (error) return <p style={{ padding: 16, color: '#c00' }}>{error} (<Link to="/browse">back</Link>)</p>;
  if (!dto) return null;

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <h2>{dto.documentName}</h2>
      <dl>
        <dt>Type</dt><dd>{dto.type}</dd>
        <dt>Invoice date</dt><dd>{dto.invoiceDate}</dd>
        <dt>Amount</dt><dd>{(dto.amount / 100).toFixed(2)} {dto.currency}</dd>
        {dto.note && (<><dt>Note</dt><dd>{dto.note}</dd></>)}
        <dt>Original file</dt><dd>{dto.originalName} ({Math.round(dto.sizeBytes / 1024)} KB)</dd>
        <dt>Uploaded</dt><dd>{new Date(dto.createdAt).toLocaleString()}</dd>
      </dl>
      <div style={{ display: 'flex', gap: 12 }}>
        <a href={api.fileUrl(dto.id)}>Download original</a>
        <button onClick={onDelete} style={{ color: '#c00' }}>Delete</button>
        <Link to="/browse">Back to list</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire route**

In `client/src/App.tsx`, replace `<Placeholder name="Detail" />` with `<ReceiptDetailPage />` and add import:

```tsx
import { ReceiptDetailPage } from './pages/ReceiptDetailPage.js';
```

- [ ] **Step 3: Verify build**

```bash
npm run build:client
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ReceiptDetailPage.tsx client/src/App.tsx
git commit -m "feat(client): add ReceiptDetailPage with download and delete"
```

---

## Phase 7 — Container & deployment

### Task 21: Multi-stage Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# --- Stage 1: build client ---
FROM node:20-alpine AS client-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.base.json tsconfig.client.json vite.config.ts ./
COPY shared ./shared
COPY client ./client
RUN npm run build:client

# --- Stage 2: build server ---
FROM node:20-alpine AS server-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.base.json tsconfig.server.json ./
COPY shared ./shared
COPY server ./server
RUN npm run build:server

# --- Stage 3: runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY migrations ./migrations
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/shared ./shared
COPY --from=client-build /app/client/dist ./client/dist
EXPOSE 5900
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:5900/api/health || exit 1
CMD ["node", "server/dist/server/src/index.js"]
```

> **Note on CMD path:** when `tsc -p tsconfig.server.json` compiles with `rootDir: "."` and `outDir: "server/dist"`, the entry point lands at `server/dist/server/src/index.js`. Verify with `ls server/dist/server/src/` after the next step. If your tsc layout differs, adjust the CMD path.

- [ ] **Step 2: Build it locally**

```bash
docker build -t receipts-app:dev .
```

Expected: build succeeds.

- [ ] **Step 3: Smoke-test the built image**

```bash
mkdir -p /tmp/receipts-docker-smoke
docker run --rm -p 5900:5900 -v /tmp/receipts-docker-smoke:/data receipts-app:dev &
sleep 3
curl http://localhost:5900/api/health
docker stop $(docker ps -q --filter ancestor=receipts-app:dev)
```

Expected: `{"ok":true,"version":"dev"}`.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "build: add multi-stage Dockerfile (client → server → runtime)"
```

---

### Task 22: docker-compose.yml + README deploy steps

**Files:**
- Create: `docker-compose.yml`
- Create: `README.md` (overwrite the stub if one exists)

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  receipts:
    build: .
    image: receipts-app:latest
    container_name: receipts
    restart: unless-stopped
    ports:
      - "5900:5900"
    volumes:
      - /volume1/docker/Document-Management:/data
    environment:
      - PORT=5900
      - DATA_DIR=/data
      - NODE_ENV=production
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Inhouse Document Management

LAN-only receipt management system for a small office.
Built with Node.js, Express, React, SQLite (FTS5).
Deployed via Portainer on a Synology NAS.

## Quick start (development)

\`\`\`bash
npm install
mkdir -p ./.local-data/db ./.local-data/file
DATA_DIR=$(pwd)/.local-data npm run dev:server   # API at :5900
npm run dev:client                                # Vite dev at :5173 (proxies /api)
\`\`\`

Open http://localhost:5173.

## Testing

\`\`\`bash
npm test                 # unit + integration
npm run test:coverage    # with coverage gate (≥ 80%)
npm run test:e2e         # playwright
\`\`\`

## Production deploy (Synology + Portainer)

### One-time setup on the NAS

1. Create the data directory:
   \`\`\`bash
   mkdir -p /volume1/docker/Document-Management/db
   mkdir -p /volume1/docker/Document-Management/file
   \`\`\`
2. In Portainer, **Stacks → Add stack**.
3. Choose **Repository** as the build method:
   - Repository URL: `https://github.com/<your-org>/Inhouse-Document-Management.git`
   - Reference: `refs/heads/main`
   - Compose path: `docker-compose.yml`
4. Enable **GitOps updates** → choose **Webhook**. Copy the webhook URL.
5. In GitHub: **Settings → Webhooks → Add webhook**:
   - Payload URL: paste the Portainer webhook URL
   - Content type: `application/json`
   - Trigger: **Just the push event**
6. Click **Deploy the stack** in Portainer.

After this, every push to `main` redeploys the stack automatically.

### Access

The app runs on `http://<NAS-IP>:5900`. Any device on the office LAN can reach it.

## Backups

The bind-mounted folder `/volume1/docker/Document-Management` contains both
the SQLite database (`db/receipts.db`) and all uploaded files (`file/...`).
Backing up that one folder backs up everything.
\`\`\`

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml README.md
git commit -m "build: add docker-compose and Portainer + Synology deploy guide"
```

---

## Phase 8 — CI

### Task 23: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm run test:coverage
      - run: npx playwright install --with-deps chromium firefox
      - run: npm run build
      - run: npm run test:e2e

  docker:
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build image (verify Dockerfile)
        uses: docker/build-push-action@v6
        with:
          context: .
          push: false
          tags: receipts-app:ci
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions for lint, typecheck, tests, coverage, e2e, docker"
```

---

## Phase 9 — Playwright E2E

### Task 24: Playwright config + global setup

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/fixtures/sample.pdf` (a minimal valid PDF)

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-e2e-'));
fs.mkdirSync(path.join(dataDir, 'db'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'file'), { recursive: true });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5900',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server/dist/server/src/index.js',
    url: 'http://127.0.0.1:5900/api/health',
    env: {
      DATA_DIR: dataDir,
      PORT: '5900',
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
    },
    timeout: 30000,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
});
```

- [ ] **Step 2: Create a minimal PDF fixture**

```bash
mkdir -p e2e/fixtures
printf '%%PDF-1.1\n%%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<</Root 1 0 R>>\nstartxref\n47\n%%%%EOF\n' > e2e/fixtures/sample.pdf
```

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts e2e/fixtures/sample.pdf
git commit -m "test(e2e): configure playwright with managed server and tmp DATA_DIR"
```

---

### Task 25: Golden-path E2E

**Files:**
- Create: `e2e/golden-path.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

test('upload → browse → detail → download', async ({ page }) => {
  await page.goto('/');

  // Pick file
  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));

  // Fill form
  await page.locator('input').filter({ hasText: '' }).first().fill('E2E Test Doc');
  // More robust: use labels
  await page.getByLabel('Document Name').fill('E2E Test Doc');
  await page.getByLabel('Invoice Date').fill('2026-04-15');
  await page.getByLabel('Amount').fill('199.99');

  await page.getByRole('button', { name: /Upload to NAS/ }).click();

  // Lands on detail page
  await expect(page.locator('h2', { hasText: 'E2E Test Doc' })).toBeVisible();
  await expect(page.locator('text=199.99 THB')).toBeVisible();

  // Browse shows the row
  await page.getByRole('link', { name: 'Browse' }).click();
  await expect(page.locator('text=E2E Test Doc')).toBeVisible();

  // Download link works (200)
  const detailLink = page.getByRole('link', { name: 'View' });
  await detailLink.click();
  const dl = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download original/ }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/sample\.pdf/);
});
```

- [ ] **Step 2: Verify by running locally**

```bash
npm run build
npm run test:e2e
```

Expected: passes in chromium + firefox.

- [ ] **Step 3: Commit**

```bash
git add e2e/golden-path.spec.ts
git commit -m "test(e2e): golden path — upload, browse, detail, download"
```

---

### Task 26: Search and filter E2E

**Files:**
- Create: `e2e/search.spec.ts`
- Create: `e2e/filter.spec.ts`

- [ ] **Step 1: Write `e2e/search.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

async function uploadOne(page: import('@playwright/test').Page, name: string) {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
  await page.getByLabel('Document Name').fill(name);
  await page.getByLabel('Invoice Date').fill('2026-04-15');
  await page.getByLabel('Amount').fill('1.00');
  await page.getByRole('button', { name: /Upload to NAS/ }).click();
  await expect(page.locator('h2', { hasText: name })).toBeVisible();
}

test('search filters by name', async ({ page }) => {
  await uploadOne(page, 'Alpha receipt');
  await uploadOne(page, 'Beta receipt');
  await uploadOne(page, 'Gamma receipt');

  await page.getByRole('link', { name: 'Browse' }).click();
  await page.getByLabel('Search').fill('Beta');

  await expect(page.locator('text=Beta receipt')).toBeVisible();
  await expect(page.locator('text=Alpha receipt')).not.toBeVisible();
  await expect(page.locator('text=Gamma receipt')).not.toBeVisible();
});
```

- [ ] **Step 2: Write `e2e/filter.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

async function uploadOne(
  page: import('@playwright/test').Page,
  name: string,
  type: 'invoice' | 'receipt' | 'quotation' | 'other',
  date: string,
) {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
  await page.getByLabel('Document Name').fill(name);
  await page.getByLabel('Type').selectOption(type);
  await page.getByLabel('Invoice Date').fill(date);
  await page.getByLabel('Amount').fill('1.00');
  await page.getByRole('button', { name: /Upload to NAS/ }).click();
  await expect(page.locator('h2', { hasText: name })).toBeVisible();
}

test('filter by type and date range', async ({ page }) => {
  await uploadOne(page, 'Inv-A', 'invoice', '2026-01-10');
  await uploadOne(page, 'Inv-B', 'invoice', '2026-06-10');
  await uploadOne(page, 'Rec-A', 'receipt', '2026-06-10');

  await page.getByRole('link', { name: 'Browse' }).click();
  await page.getByLabel('Type').selectOption('invoice');
  await page.getByLabel('From').fill('2026-05-01');
  await page.getByLabel('To').fill('2026-12-31');

  await expect(page.locator('text=Inv-B')).toBeVisible();
  await expect(page.locator('text=Inv-A')).not.toBeVisible();
  await expect(page.locator('text=Rec-A')).not.toBeVisible();
});
```

- [ ] **Step 3: Run, verify pass**

```bash
npm run test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add e2e/search.spec.ts e2e/filter.spec.ts
git commit -m "test(e2e): search and filter flows"
```

---

### Task 27: Delete E2E

**Files:**
- Create: `e2e/delete.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

test('delete removes receipt from list and detail URL 404s', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
  await page.getByLabel('Document Name').fill('To Delete');
  await page.getByLabel('Invoice Date').fill('2026-04-15');
  await page.getByLabel('Amount').fill('1.00');
  await page.getByRole('button', { name: /Upload to NAS/ }).click();

  await expect(page.locator('h2', { hasText: 'To Delete' })).toBeVisible();
  const detailUrl = page.url();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Delete/ }).click();

  await expect(page).toHaveURL(/\/browse$/);
  await expect(page.locator('text=To Delete')).not.toBeVisible();

  await page.goto(detailUrl);
  await expect(page.locator('text=/not found|NOT_FOUND/i')).toBeVisible();
});
```

- [ ] **Step 2: Run, verify pass**

```bash
npm run test:e2e
```

- [ ] **Step 3: Commit**

```bash
git add e2e/delete.spec.ts
git commit -m "test(e2e): delete flow with list removal and 404 on stale URL"
```

---

## Final verification

Before tagging v1 and pushing to `main`:

- [ ] `npm run lint && npm run format:check && npm run typecheck` — all pass.
- [ ] `npm run test:coverage` — all tests pass, coverage ≥ 80%.
- [ ] `npm run build` — both client and server build clean.
- [ ] `npm run test:e2e` — all E2E specs pass in chromium and firefox.
- [ ] `docker build -t receipts-app:v1 .` — image builds.
- [ ] Smoke: run the image with a tmp DATA_DIR, hit `/api/health`, upload a PDF via the UI, browse, download, delete.
- [ ] Push to `main` — verify GitHub Actions is green and Portainer webhook redeploys.
- [ ] On the NAS at port 5900: upload one real receipt, confirm it appears in the browse list, and that the file lands at `/volume1/docker/Document-Management/file/2026/MM/{uuid}.pdf`.

---

## Spec coverage map

| Spec section | Tasks |
|---|---|
| §3 Architecture (port 5900, container, bind-mount, Portainer Git stack) | 21, 22 |
| §3.3 Project layout | 1 |
| §4.1 Server modules | 4, 5, 6, 7, 8, 9, 11, 12, 14, 10, 13 |
| §4.2 Client modules | 15, 17, 18, 19, 20 |
| §4.3 Shared schemas | 3 |
| §5 API surface (POST, GET list, GET :id, GET file, DELETE, health) | 13, 12 |
| §6.1 Upload flow (file-then-DB, rollback) | 13 |
| §6.2 List/search flow + FTS5 | 8, 13 |
| §6.3 Download flow | 13 |
| §6.4 Delete flow | 13 |
| §7 Database schema + indexes + FTS + triggers | 6, 7 |
| §8.1 Failure modes (each row) | 10, 11, 13, 14 |
| §8.2 Error envelope | 10 |
| §8.3 Logging | 5, 13 |
| §8.4 Client error display | 16, 18 |
| §8.5 Boundary discipline | 3, 4, 13 |
| §9 Testing strategy (Vitest, supertest, Playwright, 80% gate, no mocks) | 2, 3, 7, 8, 9, 10, 13, 16, 17, 24–27 |
| §9.4 CI gates | 23 |
| §10 Risks/non-goals (no auth, no virus scan, no rate limit) | enforced by absence |
