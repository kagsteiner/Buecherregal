ALTER TABLE books ADD COLUMN hardcover_book_id INTEGER;
ALTER TABLE books ADD COLUMN hardcover_slug TEXT;
ALTER TABLE books ADD COLUMN hardcover_description TEXT;
ALTER TABLE books ADD COLUMN hardcover_genres TEXT;
ALTER TABLE books ADD COLUMN hardcover_moods TEXT;
ALTER TABLE books ADD COLUMN hardcover_tags TEXT;
ALTER TABLE books ADD COLUMN hardcover_rating REAL CHECK (
  hardcover_rating IS NULL OR hardcover_rating BETWEEN 0 AND 5
);
ALTER TABLE books ADD COLUMN hardcover_ratings_count INTEGER CHECK (
  hardcover_ratings_count IS NULL OR hardcover_ratings_count >= 0
);
ALTER TABLE books ADD COLUMN hardcover_ratings_distribution TEXT;
ALTER TABLE books ADD COLUMN hardcover_match_confidence REAL CHECK (
  hardcover_match_confidence IS NULL OR hardcover_match_confidence BETWEEN 0 AND 1
);
ALTER TABLE books ADD COLUMN hardcover_lookup_at TEXT;
ALTER TABLE books ADD COLUMN hardcover_enriched_at TEXT;

CREATE INDEX IF NOT EXISTS books_hardcover_book_id_idx ON books(hardcover_book_id);

PRAGMA user_version = 7;
