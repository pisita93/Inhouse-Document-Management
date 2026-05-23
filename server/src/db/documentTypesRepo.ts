import type { DB } from './connection.js';
import type {
  DocumentTypeDTO,
  DocumentTypeCreate,
  DocumentTypePatch,
} from '../../../shared/schemas.js';

interface Row {
  id: string;
  label: string;
  requires_financial: number;
  sort_order: number;
  disabled_at: string | null;
  created_at: string;
}

function rowToDTO(r: Row): DocumentTypeDTO {
  return {
    id: r.id,
    label: r.label,
    requiresFinancial: r.requires_financial === 1,
    sortOrder: r.sort_order,
    disabledAt: r.disabled_at,
    createdAt: r.created_at,
  };
}

export function createDocumentTypesRepo(db: DB) {
  const insertStmt = db.prepare(`
    INSERT INTO document_types (id, label, requires_financial, sort_order, created_at)
    VALUES (@id, @label, @requires_financial, @sort_order, @created_at)
  `);
  const getStmt = db.prepare(`SELECT * FROM document_types WHERE id = ?`);
  const listAllStmt = db.prepare(`SELECT * FROM document_types ORDER BY sort_order, id`);
  const listActiveStmt = db.prepare(
    `SELECT * FROM document_types WHERE disabled_at IS NULL ORDER BY sort_order, id`,
  );

  const repo = {
    list({ includeDisabled }: { includeDisabled: boolean }): DocumentTypeDTO[] {
      const stmt = includeDisabled ? listAllStmt : listActiveStmt;
      return (stmt.all() as Row[]).map(rowToDTO);
    },

    getById(id: string): DocumentTypeDTO | null {
      const row = getStmt.get(id) as Row | undefined;
      return row ? rowToDTO(row) : null;
    },

    create(input: DocumentTypeCreate): DocumentTypeDTO {
      insertStmt.run({
        id: input.id,
        label: input.label,
        requires_financial: input.requiresFinancial ? 1 : 0,
        sort_order: input.sortOrder,
        created_at: new Date().toISOString(),
      });
      const got = repo.getById(input.id);
      if (!got) throw new Error('insert succeeded but row missing');
      return got;
    },

    patch(id: string, patch: DocumentTypePatch): DocumentTypeDTO | null {
      const sets: string[] = [];
      const params: Record<string, unknown> = { id };
      if (patch.label !== undefined) {
        sets.push('label = @label');
        params.label = patch.label;
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
      db.prepare(`UPDATE document_types SET ${sets.join(', ')} WHERE id = @id`).run(params);
      return repo.getById(id);
    },
  };

  return repo;
}
