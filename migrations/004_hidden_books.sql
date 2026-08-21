ALTER TABLE books ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1));
ALTER TABLE books ADD COLUMN hidden_at TEXT;

PRAGMA user_version = 4;
