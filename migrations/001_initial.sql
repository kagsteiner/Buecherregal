PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  asin TEXT,
  title TEXT NOT NULL,
  authors TEXT,
  publisher TEXT,
  publication_date TEXT,
  language TEXT,
  content_type TEXT,
  progress_percent REAL CHECK (
    progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100
  ),
  current_position INTEGER,
  max_position INTEGER,
  is_downloaded INTEGER NOT NULL DEFAULT 0 CHECK (is_downloaded IN (0, 1)),
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS books_title_idx ON books(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS books_authors_idx ON books(authors COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS books_asin_idx ON books(asin);

CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_imported INTEGER NOT NULL DEFAULT 0,
  records_with_authors INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  details TEXT
);

PRAGMA user_version = 1;
