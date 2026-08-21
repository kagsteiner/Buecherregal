import { databasePath } from '../config.js';
import { migrate, openDatabase } from '../database.js';
import { cleanTitle } from '../books.js';

const USER_AGENT = 'Buecherregal-MVP/0.1 (private local library)';

export function normalizeBookMetadata(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function queryBookTitle(title) {
  return cleanTitle(title)
    .replace(/\s*\([^)]*(kindle|edition|ausgabe)[^)]*\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function queryBookAuthor(authors) {
  const first = authors.split(/;|\s&\s/)[0].trim();
  const parts = first.split(',').map((part) => part.trim());
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : first;
}

export function authorMatches(candidateAuthors, requestedAuthor) {
  const requested = normalizeBookMetadata(requestedAuthor).split(' ').filter((word) => word.length > 2);
  const candidates = normalizeBookMetadata((candidateAuthors || []).join(' '));
  return requested.some((word) => candidates.includes(word));
}

export function choosePageCount(docs, title, author) {
  const requestedTitle = normalizeBookMetadata(title);
  const ranked = docs
    .filter((doc) => Number.isInteger(doc.number_of_pages_median))
    .filter((doc) => doc.number_of_pages_median >= 20 && doc.number_of_pages_median <= 5000)
    .map((doc) => {
      const candidateTitle = normalizeBookMetadata(doc.title || '');
      const exactTitle = candidateTitle === requestedTitle;
      const relatedTitle = candidateTitle.includes(requestedTitle) || requestedTitle.includes(candidateTitle);
      const sameAuthor = authorMatches(doc.author_name, author);
      return { doc, score: (exactTitle ? 4 : relatedTitle ? 2 : 0) + (sameAuthor ? 3 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 5 ? ranked[0].doc : null;
}

async function lookup(book) {
  const title = queryBookTitle(book.title);
  const author = queryBookAuthor(book.authors || '');
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('title', title);
  if (author) url.searchParams.set('author', author);
  url.searchParams.set('fields', 'key,title,author_name,number_of_pages_median');
  url.searchParams.set('limit', '5');

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Open Library HTTP ${response.status}`);
  const body = await response.json();
  return choosePageCount(body.docs || [], title, author);
}

export async function enrichPageCounts({ path = databasePath, limit } = {}) {
  const database = openDatabase(path);
  migrate(database);
  const suffix = limit ? ' LIMIT ?' : '';
  const books = database.prepare(`
    SELECT id, title, authors FROM books
    WHERE page_count IS NULL AND authors IS NOT NULL AND authors <> ''
    ORDER BY id${suffix}
  `).all(...(limit ? [limit] : []));
  const update = database.prepare(`
    UPDATE books
    SET page_count = ?, page_count_source = 'openlibrary', metadata_source_id = ?, updated_at = ?
    WHERE id = ? AND page_count IS NULL
  `);
  let matched = 0;
  let errors = 0;

  for (const [index, book] of books.entries()) {
    try {
      const match = await lookup(book);
      if (match) {
        update.run(match.number_of_pages_median, match.key, new Date().toISOString(), book.id);
        matched += 1;
      }
    } catch (error) {
      errors += 1;
      console.error(`[${index + 1}/${books.length}] ${book.title}: ${error.message}`);
      if (/HTTP 429/.test(error.message)) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    if ((index + 1) % 25 === 0) console.log(`${index + 1}/${books.length}, ${matched} Seitenzahlen gefunden`);
    await new Promise((resolve) => setTimeout(resolve, 180));
  }

  database.exec('PRAGMA optimize');
  database.close();
  return { checked: books.length, matched, errors };
}
