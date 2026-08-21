ALTER TABLE books ADD COLUMN cover_local_path TEXT;
ALTER TABLE books ADD COLUMN cover_source TEXT;
ALTER TABLE books ADD COLUMN cover_source_id TEXT;
ALTER TABLE books ADD COLUMN cover_match_confidence REAL CHECK (
  cover_match_confidence IS NULL OR cover_match_confidence BETWEEN 0 AND 1
);
ALTER TABLE books ADD COLUMN cover_lookup_at TEXT;
ALTER TABLE books ADD COLUMN cover_fetched_at TEXT;

CREATE INDEX IF NOT EXISTS books_cover_local_path_idx ON books(cover_local_path);

PRAGMA user_version = 6;
