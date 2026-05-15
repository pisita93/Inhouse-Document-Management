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
