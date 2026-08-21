ALTER TABLE books ADD COLUMN title_font_key TEXT;
ALTER TABLE books ADD COLUMN author_font_key TEXT;
ALTER TABLE books ADD COLUMN title_text_color TEXT CHECK (
  title_text_color IS NULL OR (length(title_text_color) = 7 AND substr(title_text_color, 1, 1) = '#')
);
ALTER TABLE books ADD COLUMN author_text_color TEXT CHECK (
  author_text_color IS NULL OR (length(author_text_color) = 7 AND substr(author_text_color, 1, 1) = '#')
);
ALTER TABLE books ADD COLUMN spine_layout TEXT CHECK (
  spine_layout IS NULL OR spine_layout IN ('inline', 'split')
);
ALTER TABLE books ADD COLUMN title_font_weight INTEGER;
ALTER TABLE books ADD COLUMN author_font_weight INTEGER;
ALTER TABLE books ADD COLUMN title_letter_spacing REAL;
ALTER TABLE books ADD COLUMN author_letter_spacing REAL;
ALTER TABLE books ADD COLUMN title_case TEXT;
ALTER TABLE books ADD COLUMN author_case TEXT;
ALTER TABLE books ADD COLUMN typography_confidence REAL CHECK (
  typography_confidence IS NULL OR typography_confidence BETWEEN 0 AND 1
);
ALTER TABLE books ADD COLUMN typography_model TEXT;
ALTER TABLE books ADD COLUMN typography_catalog_version TEXT;
ALTER TABLE books ADD COLUMN typography_analysis TEXT;
ALTER TABLE books ADD COLUMN typography_analyzed_at TEXT;

PRAGMA user_version = 5;
