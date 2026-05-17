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
