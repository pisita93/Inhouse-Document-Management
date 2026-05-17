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
