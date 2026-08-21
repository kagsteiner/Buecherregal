import { openDatabase, migrate } from './database.js';

export function deterministicPageCount(id) {
  let hash = 2166136261;
  for (const character of String(id)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 300 + ((hash >>> 0) % 301);
}

export function cleanTitle(title) {
  return title
    .replace(/_for_Kindle$/i, '')
    .replaceAll('_', ' ')
    .replace(/\s*\(English Edition\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function coverUrl(asin) {
  if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) return null;
  return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
}

export function listBooks(databasePath) {
  const database = openDatabase(databasePath);
  migrate(database);
  const rows = database.prepare(`
    SELECT id, source_id, asin, title, authors, page_count, page_count_source
    FROM books
    WHERE title <> ''
    ORDER BY title COLLATE NOCASE
  `).all();
  database.close();

  return rows.map((book) => {
    const fallbackPages = deterministicPageCount(book.source_id);
    return {
      id: book.id,
      sourceId: book.source_id,
      title: cleanTitle(book.title),
      authors: book.authors || 'Unbekannt',
      asin: book.asin,
      pageCount: book.page_count,
      layoutPages: book.page_count || fallbackPages,
      pageCountKnown: book.page_count !== null,
      pageCountSource: book.page_count_source,
      coverUrl: coverUrl(book.asin),
    };
  });
}
