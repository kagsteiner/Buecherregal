ALTER TABLE books ADD COLUMN page_count INTEGER CHECK (page_count IS NULL OR page_count > 0);
ALTER TABLE books ADD COLUMN page_count_source TEXT;
ALTER TABLE books ADD COLUMN metadata_source_id TEXT;

PRAGMA user_version = 2;
