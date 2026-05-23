import { v4 as uuidv4 } from 'uuid';
import type { DB } from './connection.js';
import type { CategoryDTO, CategoryCreate, CategoryPatch } from '../../../shared/schemas.js';

interface Row {
  id: string;
  name: string;
  sort_order: number;
  disabled_at: string | null;
  created_at: string;
}

function rowToDTO(r: Row): CategoryDTO {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    disabledAt: r.disabled_at,
    createdAt: r.created_at,
  };
}

export function createCategoriesRepo(db: DB) {
  const insertStmt = db.prepare(`
    INSERT INTO categories (id, name, sort_order, created_at)
    VALUES (@id, @name, @sort_order, @created_at)
  `);
  const getStmt = db.prepare(`SELECT * FROM categories WHERE id = ?`);
  const deleteStmt = db.prepare(`DELETE FROM categories WHERE id = ?`);
  const listAllStmt = db.prepare(`SELECT * FROM categories ORDER BY sort_order, name`);
  const listActiveStmt = db.prepare(
    `SELECT * FROM categories WHERE disabled_at IS NULL ORDER BY sort_order, name`,
  );

  const repo = {
    list({ includeDisabled }: { includeDisabled: boolean }): CategoryDTO[] {
      const stmt = includeDisabled ? listAllStmt : listActiveStmt;
      return (stmt.all() as Row[]).map(rowToDTO);
    },

    getById(id: string): CategoryDTO | null {
      const row = getStmt.get(id) as Row | undefined;
      return row ? rowToDTO(row) : null;
    },

    create(input: CategoryCreate): CategoryDTO {
      const id = uuidv4();
      insertStmt.run({
        id,
        name: input.name,
        sort_order: input.sortOrder,
        created_at: new Date().toISOString(),
      });
      const got = repo.getById(id);
      if (!got) throw new Error('insert succeeded but row missing');
      return got;
    },

    patch(id: string, patch: CategoryPatch): CategoryDTO | null {
      const sets: string[] = [];
      const params: Record<string, unknown> = { id };
      if (patch.name !== undefined) {
        sets.push('name = @name');
        params.name = patch.name;
      }
      if (patch.sortOrder !== undefined) {
        sets.push('sort_order = @sort_order');
        params.sort_order = patch.sortOrder;
      }
      if (patch.disabledAt !== undefined) {
        sets.push('disabled_at = @disabled_at');
        params.disabled_at = patch.disabledAt;
      }
      if (sets.length === 0) return repo.getById(id);
      db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = @id`).run(params);
      return repo.getById(id);
    },

    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };

  return repo;
}
