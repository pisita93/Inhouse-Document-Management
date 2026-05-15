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
