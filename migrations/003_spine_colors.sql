ALTER TABLE books ADD COLUMN spine_color TEXT CHECK (
  spine_color IS NULL OR (length(spine_color) = 7 AND substr(spine_color, 1, 1) = '#')
);
ALTER TABLE books ADD COLUMN spine_color_source TEXT;
ALTER TABLE books ADD COLUMN cover_analyzed_at TEXT;

PRAGMA user_version = 3;
