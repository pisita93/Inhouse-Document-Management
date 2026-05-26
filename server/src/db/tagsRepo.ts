import { v4 as uuidv4 } from 'uuid';
import type { DB } from './connection.js';
import type { TagDTO } from '../../../shared/schemas.js';

interface Row {
  id: string;
  name: string;
  created_at: string;
}

interface ListRow extends Row {
  usage_count: number;
}

function rowToDTO(r: Row): TagDTO {
  return { id: r.id, name: r.name, createdAt: r.created_at };
}

function listRowToDTO(r: ListRow): TagDTO {
  return { id: r.id, name: r.name, createdAt: r.created_at, usageCount: r.usage_count };
}

export function createTagsRepo(db: DB) {
  const insertStmt = db.prepare(
    `INSERT INTO tags (id, name, created_at) VALUES (@id, @name, @created_at)`,
  );
  const getByNameStmt = db.prepare(`SELECT * FROM tags WHERE name = ? COLLATE NOCASE`);
  const getByIdStmt = db.prepare(`SELECT * FROM tags WHERE id = ?`);
  const listAllStmt = db.prepare(
    `SELECT t.*, COUNT(dt.tag_id) AS usage_count
     FROM tags t LEFT JOIN document_tags dt ON dt.tag_id = t.id
     GROUP BY t.id ORDER BY t.name`,
  );
  const listQueryStmt = db.prepare(
    `SELECT t.*, COUNT(dt.tag_id) AS usage_count
     FROM tags t LEFT JOIN document_tags dt ON dt.tag_id = t.id
     WHERE t.name LIKE ? COLLATE NOCASE
     GROUP BY t.id ORDER BY t.name LIMIT 50`,
  );
  const renameStmt = db.prepare(`UPDATE tags SET name = ? WHERE id = ?`);
  const deleteStmt = db.prepare(`DELETE FROM tags WHERE id = ?`);

  const repo = {
    list({ q }: { q?: string }): TagDTO[] {
      if (q && q.length > 0) {
        return (listQueryStmt.all(`%${q}%`) as ListRow[]).map(listRowToDTO);
      }
      return (listAllStmt.all() as ListRow[]).map(listRowToDTO);
    },

    getById(id: string): TagDTO | null {
      const row = getByIdStmt.get(id) as Row | undefined;
      return row ? rowToDTO(row) : null;
    },

    getByName(name: string): TagDTO | null {
      const row = getByNameStmt.get(name) as Row | undefined;
      return row ? rowToDTO(row) : null;
    },

    upsertByName(rawName: string): TagDTO {
      const name = rawName.trim().toLowerCase();
      const existing = repo.getByName(name);
      if (existing) return existing;
      const id = uuidv4();
      insertStmt.run({ id, name, created_at: new Date().toISOString() });
      const got = repo.getById(id);
      if (!got) throw new Error('insert succeeded but row missing');
      return got;
    },

    rename(id: string, name: string): TagDTO | null {
      const result = renameStmt.run(name, id);
      if (result.changes === 0) return null;
      return repo.getById(id);
    },

    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };

  return repo;
}
