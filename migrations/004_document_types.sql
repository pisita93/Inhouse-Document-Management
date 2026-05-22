-- Phase 2: configurable document types, categories, tags, contentless FTS rebuild.

CREATE TABLE document_types (
  id                  TEXT PRIMARY KEY,
  label               TEXT NOT NULL,
  requires_financial  INTEGER NOT NULL DEFAULT 0 CHECK(requires_financial IN (0,1)),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  disabled_at         TEXT,
  created_at          TEXT NOT NULL
);

CREATE TABLE categories (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  disabled_at  TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at  TEXT NOT NULL
);

CREATE TABLE document_tags (
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id       TEXT NOT NULL REFERENCES tags(id)      ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);
CREATE INDEX idx_document_tags_tag ON document_tags(tag_id);

INSERT INTO document_types (id, label, requires_financial, sort_order, created_at) VALUES
  ('invoice',          'Invoice',           1, 10, datetime('now')),
  ('receipt',          'Receipt',           1, 20, datetime('now')),
  ('quotation',        'Quotation',         0, 30, datetime('now')),
  ('contract',         'Contract',          0, 40, datetime('now')),
  ('policy',           'Policy',            0, 50, datetime('now')),
  ('hr_document',      'HR Document',       0, 60, datetime('now')),
  ('meeting_minutes',  'Meeting Minutes',   0, 70, datetime('now')),
  ('report',           'Report',            0, 80, datetime('now')),
  ('certificate',      'Certificate',       0, 90, datetime('now')),
  ('other',            'Other',             0, 99, datetime('now'));

-- Drop existing FTS and triggers (rebuild with new shape below).
DROP TRIGGER IF EXISTS documents_ai;
DROP TRIGGER IF EXISTS documents_ad;
DROP TABLE   IF EXISTS documents_fts;

-- Rebuild documents: drop CHECK on type, add FKs and category_id.
CREATE TABLE documents_new (
  id              TEXT PRIMARY KEY,
  document_name   TEXT NOT NULL,
  type            TEXT NOT NULL REFERENCES document_types(id),
  category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
  document_date   TEXT NOT NULL,
  invoice_date    TEXT,
  amount          INTEGER CHECK(amount IS NULL OR amount >= 0),
  currency        TEXT    CHECK(currency IS NULL OR currency IN ('THB','USD','EUR','JPY','CNY')),
  note            TEXT,
  short_note      TEXT,
  filename        TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at      TEXT NOT NULL
);

INSERT INTO documents_new (
  id, document_name, type, category_id, document_date, invoice_date,
  amount, currency, note, short_note, filename, original_name, mime_type,
  size_bytes, created_at
)
SELECT id, document_name, type, NULL, document_date, invoice_date,
       amount, currency, note, short_note, filename, original_name, mime_type,
       size_bytes, created_at
FROM documents;

DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE INDEX idx_documents_document_date ON documents(document_date);
CREATE INDEX idx_documents_invoice_date  ON documents(invoice_date);
CREATE INDEX idx_documents_type          ON documents(type);
CREATE INDEX idx_documents_category      ON documents(category_id);
CREATE INDEX idx_documents_created_at    ON documents(created_at);

-- Contentless FTS5 over document_name, note, short_note, tag_names, category_name.
CREATE VIRTUAL TABLE documents_fts USING fts5(
  document_name, note, short_note, tag_names, category_name,
  content=''
);

CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, document_name, note, short_note, tag_names, category_name)
  VALUES (
    new.rowid,
    new.document_name,
    COALESCE(new.note, ''),
    COALESCE(new.short_note, ''),
    COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
              FROM tags t JOIN document_tags dt ON dt.tag_id = t.id
              WHERE dt.document_id = new.id), ''),
    COALESCE((SELECT name FROM categories WHERE id = new.category_id), '')
  );
END;

CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, document_name, note, short_note, tag_names, category_name)
  VALUES ('delete', old.rowid,
    old.document_name,
    COALESCE(old.note, ''),
    COALESCE(old.short_note, ''),
    COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
              FROM tags t JOIN document_tags dt ON dt.tag_id = t.id
              WHERE dt.document_id = old.id), ''),
    COALESCE((SELECT name FROM categories WHERE id = old.category_id), ''));
  INSERT INTO documents_fts(rowid, document_name, note, short_note, tag_names, category_name)
  VALUES (
    new.rowid,
    new.document_name,
    COALESCE(new.note, ''),
    COALESCE(new.short_note, ''),
    COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
              FROM tags t JOIN document_tags dt ON dt.tag_id = t.id
              WHERE dt.document_id = new.id), ''),
    COALESCE((SELECT name FROM categories WHERE id = new.category_id), '')
  );
END;

CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, document_name, note, short_note, tag_names, category_name)
  VALUES ('delete', old.rowid,
    old.document_name,
    COALESCE(old.note, ''),
    COALESCE(old.short_note, ''),
    COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
              FROM tags t JOIN document_tags dt ON dt.tag_id = t.id
              WHERE dt.document_id = old.id), ''),
    COALESCE((SELECT name FROM categories WHERE id = old.category_id), ''));
END;

-- Tag join triggers: refresh FTS row when tags are attached/detached.
CREATE TRIGGER document_tags_ai AFTER INSERT ON document_tags BEGIN
  UPDATE documents SET document_name = document_name WHERE id = new.document_id;
END;

CREATE TRIGGER document_tags_ad AFTER DELETE ON document_tags BEGIN
  UPDATE documents SET document_name = document_name WHERE id = old.document_id;
END;

-- Category rename trigger: refresh FTS row for every doc in that category.
CREATE TRIGGER categories_au AFTER UPDATE OF name ON categories BEGIN
  UPDATE documents SET document_name = document_name WHERE category_id = new.id;
END;

-- Backfill FTS for any existing documents (tags/category empty until later writes attach them).
INSERT INTO documents_fts(rowid, document_name, note, short_note, tag_names, category_name)
  SELECT d.rowid, d.document_name, COALESCE(d.note, ''), COALESCE(d.short_note, ''), '', ''
  FROM documents d;
