CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  document_name   TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN (
                    'invoice','receipt','quotation','contract','policy',
                    'hr_document','meeting_minutes','report','certificate','other')),
  document_date   TEXT NOT NULL,
  invoice_date    TEXT,
  amount          INTEGER CHECK(amount IS NULL OR amount >= 0),
  currency        TEXT    CHECK(currency IS NULL OR currency IN ('THB','USD','EUR','JPY','CNY')),
  note            TEXT,
  filename        TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at      TEXT NOT NULL
);

INSERT OR IGNORE INTO documents (
  id, document_name, type, document_date, invoice_date,
  amount, currency, note, filename, original_name, mime_type, size_bytes, created_at)
SELECT id, document_name, type,
       substr(created_at, 1, 10) AS document_date,
       invoice_date,
       amount, currency, note, filename, original_name, mime_type, size_bytes, created_at
FROM receipts;

DROP TABLE IF EXISTS receipts_fts;
DROP TABLE IF EXISTS receipts;

CREATE INDEX IF NOT EXISTS idx_documents_document_date ON documents(document_date);
CREATE INDEX IF NOT EXISTS idx_documents_invoice_date  ON documents(invoice_date);
CREATE INDEX IF NOT EXISTS idx_documents_type          ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at    ON documents(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  document_name, note, content='documents', content_rowid='rowid');

INSERT INTO documents_fts(rowid, document_name, note)
  SELECT rowid, document_name, COALESCE(note, '') FROM documents
  WHERE NOT EXISTS (SELECT 1 FROM documents_fts);

CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, document_name, note)
  VALUES (new.rowid, new.document_name, COALESCE(new.note, ''));
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, document_name, note)
  VALUES('delete', old.rowid, old.document_name, COALESCE(old.note, ''));
END;
