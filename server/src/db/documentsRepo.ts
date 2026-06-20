import { v4 as uuidv4 } from 'uuid';
import type { DB } from './connection.js';
import type { DocumentDTO, Currency, ListQuery } from '../../../shared/schemas.js';

interface DocumentRow {
  id: string;
  document_name: string;
  type: string;
  category_id: string | null;
  document_date: string;
  invoice_date: string | null;
  amount: number | null;
  currency: Currency | null;
  short_note: string | null;
  note: string | null;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface DocumentRowInput {
  id: string;
  documentName: string;
  type: string;
  documentDate: string;
  invoiceDate: string | null;
  amount: number | null;
  currency: Currency | null;
  shortNote: string | null;
  note: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface Joins {
  category: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
}

function rowToDTO(r: DocumentRow, joins: Joins): DocumentDTO {
  return {
    id: r.id,
    documentName: r.document_name,
    type: r.type,
    category: joins.category,
    tags: joins.tags,
    documentDate: r.document_date,
    invoiceDate: r.invoice_date,
    amount: r.amount,
    currency: r.currency,
    shortNote: r.short_note ?? undefined,
    note: r.note ?? undefined,
    filename: r.filename,
    originalName: r.original_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  };
}

export interface ListResult {
  items: DocumentDTO[];
  total: number;
  page: number;
  pageSize: number;
}

function shortNoteToLike(pattern: string): string {
  const escaped = pattern.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const withWildcards = escaped.replace(/\*/g, '%');
  return withWildcards.includes('%') ? withWildcards : `%${withWildcards}%`;
}

export function createDocumentsRepo(db: DB) {
  const insertStmt = db.prepare(`
    INSERT INTO documents (
      id, document_name, type, category_id, document_date, invoice_date, amount, currency,
      short_note, note,
      filename, original_name, mime_type, size_bytes, created_at
    ) VALUES (
      @id, @documentName, @type, @categoryId, @documentDate, @invoiceDate, @amount, @currency,
      @shortNote, @note,
      @filename, @originalName, @mimeType, @sizeBytes, @createdAt
    )
  `);

  const getStmt = db.prepare(`SELECT * FROM documents WHERE id = ?`);
  const deleteStmt = db.prepare(`DELETE FROM documents WHERE id = ?`);
  const getCategoryStmt = db.prepare(`SELECT id, name FROM categories WHERE id = ?`);

  const upsertTagStmt = db.prepare(
    `INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (@id, @name, @created_at)`,
  );
  const selectTagByNameStmt = db.prepare(`SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE`);
  const linkTagStmt = db.prepare(
    `INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)`,
  );

  function buildListSQL(q: ListQuery): { sql: string; countSQL: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    let fromClause = 'FROM documents d';
    let orderBy = 'ORDER BY d.document_date DESC, d.created_at DESC';

    if (q.q) {
      fromClause += ' JOIN documents_fts f ON f.rowid = d.rowid';
      where.push('f.documents_fts MATCH ?');
      params.push(`${q.q.replace(/["*]/g, '')}*`);
      orderBy = 'ORDER BY bm25(documents_fts)';
    }
    if (q.type) {
      where.push('d.type = ?');
      params.push(q.type);
    }
    if (q.categoryId) {
      where.push('d.category_id = ?');
      params.push(q.categoryId);
    }
    if (q.tagIds && q.tagIds.length > 0) {
      const placeholders = q.tagIds.map(() => '?').join(',');
      if (q.tagMatch === 'any') {
        where.push(
          `d.id IN (SELECT document_id FROM document_tags WHERE tag_id IN (${placeholders}))`,
        );
        params.push(...q.tagIds);
      } else {
        where.push(
          `d.id IN (SELECT document_id FROM document_tags WHERE tag_id IN (${placeholders})` +
            ` GROUP BY document_id HAVING COUNT(DISTINCT tag_id) = ?)`,
        );
        params.push(...q.tagIds, q.tagIds.length);
      }
    }
    if (q.invoiceDateFrom) {
      where.push('d.invoice_date >= ?');
      params.push(q.invoiceDateFrom);
    }
    if (q.invoiceDateTo) {
      where.push('d.invoice_date <= ?');
      params.push(q.invoiceDateTo);
    }
    if (q.uploadDateFrom) {
      where.push('d.document_date >= ?');
      params.push(q.uploadDateFrom);
    }
    if (q.uploadDateTo) {
      where.push('d.document_date <= ?');
      params.push(q.uploadDateTo);
    }
    if (q.shortNote) {
      where.push("d.short_note LIKE ? ESCAPE '\\'");
      params.push(shortNoteToLike(q.shortNote));
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT d.* ${fromClause} ${whereClause} ${orderBy} LIMIT ? OFFSET ?`;
    const countSQL = `SELECT COUNT(DISTINCT d.id) AS c ${fromClause} ${whereClause}`;
    return { sql, countSQL, params };
  }

  function attachJoins(rows: DocumentRow[]): DocumentDTO[] {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const tagPlaceholders = ids.map(() => '?').join(',');
    const tagRows = db
      .prepare(
        `SELECT dt.document_id, t.id, t.name
         FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
         WHERE dt.document_id IN (${tagPlaceholders})`,
      )
      .all(...ids) as Array<{ document_id: string; id: string; name: string }>;

    const tagsByDoc = new Map<string, Array<{ id: string; name: string }>>();
    for (const tr of tagRows) {
      const arr = tagsByDoc.get(tr.document_id) ?? [];
      arr.push({ id: tr.id, name: tr.name });
      tagsByDoc.set(tr.document_id, arr);
    }

    const categoryIds = rows.map((r) => r.category_id).filter((x): x is string => x !== null);
    const catRows =
      categoryIds.length === 0
        ? []
        : (db
            .prepare(
              `SELECT id, name FROM categories WHERE id IN (${categoryIds.map(() => '?').join(',')})`,
            )
            .all(...categoryIds) as Array<{ id: string; name: string }>);
    const catById = new Map(catRows.map((c) => [c.id, c]));

    return rows.map((r) =>
      rowToDTO(r, {
        category: r.category_id ? (catById.get(r.category_id) ?? null) : null,
        tags: tagsByDoc.get(r.id) ?? [],
      }),
    );
  }

  function resolveCategoryById(categoryId: string | null): { id: string; name: string } | null {
    if (!categoryId) return null;
    const row = getCategoryStmt.get(categoryId) as { id: string; name: string } | undefined;
    return row ?? null;
  }

  return {
    insertWithRelations(input: {
      dto: DocumentRowInput;
      categoryId: string | null;
      tagNames: string[];
    }): DocumentDTO {
      let resolvedCategory: { id: string; name: string } | null = null;
      const resolvedTags: Array<{ id: string; name: string }> = [];
      const seenTagNames = new Set<string>();

      const txn = db.transaction(() => {
        insertStmt.run({
          id: input.dto.id,
          documentName: input.dto.documentName,
          type: input.dto.type,
          categoryId: input.categoryId,
          documentDate: input.dto.documentDate,
          invoiceDate: input.dto.invoiceDate,
          amount: input.dto.amount,
          currency: input.dto.currency,
          shortNote: input.dto.shortNote,
          note: input.dto.note,
          filename: input.dto.filename,
          originalName: input.dto.originalName,
          mimeType: input.dto.mimeType,
          sizeBytes: input.dto.sizeBytes,
          createdAt: input.dto.createdAt,
        });

        resolvedCategory = resolveCategoryById(input.categoryId);

        for (const rawName of input.tagNames) {
          const name = rawName.trim().toLowerCase();
          if (!name || seenTagNames.has(name)) continue;
          seenTagNames.add(name);
          upsertTagStmt.run({
            id: uuidv4(),
            name,
            created_at: new Date().toISOString(),
          });
          const tagRow = selectTagByNameStmt.get(name) as { id: string; name: string } | undefined;
          if (!tagRow) {
            throw new Error(`tag upsert failed for name=${name}`);
          }
          linkTagStmt.run(input.dto.id, tagRow.id);
          resolvedTags.push({ id: tagRow.id, name: tagRow.name });
        }
      });
      txn();

      const row = getStmt.get(input.dto.id) as DocumentRow;
      return rowToDTO(row, { category: resolvedCategory, tags: resolvedTags });
    },

    getById(id: string): DocumentDTO | null {
      const row = getStmt.get(id) as DocumentRow | undefined;
      if (!row) return null;
      return attachJoins([row])[0] ?? null;
    },

    list(q: ListQuery): ListResult {
      const { sql, countSQL, params } = buildListSQL(q);
      const offset = (q.page - 1) * q.pageSize;
      const rows = db.prepare(sql).all(...params, q.pageSize, offset) as DocumentRow[];
      const total = (db.prepare(countSQL).get(...params) as { c: number }).c;
      return {
        items: attachJoins(rows),
        total,
        page: q.page,
        pageSize: q.pageSize,
      };
    },

    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },

    reset(): void {
      db.prepare('DELETE FROM documents').run();
    },

    allIds(): string[] {
      return (db.prepare('SELECT id FROM documents').all() as Array<{ id: string }>).map(
        (r) => r.id,
      );
    },
  };
}
