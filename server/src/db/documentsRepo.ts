import type { DB } from './connection.js';
import type { DocumentDTO, DocumentType, Currency, ListQuery } from '../../../shared/schemas.js';

interface DocumentRow {
  id: string;
  document_name: string;
  type: DocumentType;
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

function rowToDTO(r: DocumentRow): DocumentDTO {
  return {
    id: r.id,
    documentName: r.document_name,
    type: r.type,
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
      id, document_name, type, document_date, invoice_date, amount, currency,
      short_note, note,
      filename, original_name, mime_type, size_bytes, created_at
    ) VALUES (
      @id, @documentName, @type, @documentDate, @invoiceDate, @amount, @currency,
      @shortNote, @note,
      @filename, @originalName, @mimeType, @sizeBytes, @createdAt
    )
  `);

  const getStmt = db.prepare(`SELECT * FROM documents WHERE id = ?`);
  const deleteStmt = db.prepare(`DELETE FROM documents WHERE id = ?`);

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
    const countSQL = `SELECT COUNT(*) AS c ${fromClause} ${whereClause}`;
    return { sql, countSQL, params };
  }

  return {
    insert(dto: DocumentDTO): void {
      insertStmt.run({
        id: dto.id,
        documentName: dto.documentName,
        type: dto.type,
        documentDate: dto.documentDate,
        invoiceDate: dto.invoiceDate,
        amount: dto.amount,
        currency: dto.currency,
        shortNote: dto.shortNote ?? null,
        note: dto.note ?? null,
        filename: dto.filename,
        originalName: dto.originalName,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        createdAt: dto.createdAt,
      });
    },

    getById(id: string): DocumentDTO | null {
      const row = getStmt.get(id) as DocumentRow | undefined;
      return row ? rowToDTO(row) : null;
    },

    list(q: ListQuery): ListResult {
      const { sql, countSQL, params } = buildListSQL(q);
      const offset = (q.page - 1) * q.pageSize;
      const rows = db.prepare(sql).all(...params, q.pageSize, offset) as DocumentRow[];
      const total = (db.prepare(countSQL).get(...params) as { c: number }).c;
      return { items: rows.map(rowToDTO), total, page: q.page, pageSize: q.pageSize };
    },

    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },

    reset(): void {
      db.prepare('DELETE FROM documents').run();
    },
  };
}
