CREATE TABLE IF NOT EXISTS receipts (
  id              TEXT PRIMARY KEY,
  document_name   TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('invoice','receipt','quotation','other')),
  invoice_date    TEXT NOT NULL,
  amount          INTEGER NOT NULL CHECK(amount >= 0),
  currency        TEXT NOT NULL CHECK(currency IN ('THB','USD','EUR','JPY','CNY')),
  note            TEXT,
  filename        TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receipts_invoice_date ON receipts(invoice_date);
CREATE INDEX IF NOT EXISTS idx_receipts_type         ON receipts(type);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at   ON receipts(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS receipts_fts USING fts5(
  document_name, note, content='receipts', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS receipts_ai AFTER INSERT ON receipts BEGIN
  INSERT INTO receipts_fts(rowid, document_name, note)
  VALUES (new.rowid, new.document_name, COALESCE(new.note, ''));
END;

CREATE TRIGGER IF NOT EXISTS receipts_ad AFTER DELETE ON receipts BEGIN
  INSERT INTO receipts_fts(receipts_fts, rowid, document_name, note)
  VALUES('delete', old.rowid, old.document_name, COALESCE(old.note, ''));
END;
