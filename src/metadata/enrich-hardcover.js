import { databasePath } from '../config.js';
import { migrate, openDatabase } from '../database.js';
import { normalizeBookMetadata, queryBookAuthor, queryBookTitle } from './enrich-pages.js';

const API_URL = 'https://api.hardcover.app/v1/graphql';
const DEFAULT_DELAY_MS = 250;
const SEARCH_LIMIT = 5;

const BOOK_FIELDS = `
  id
  title
  slug
  description
  rating
  ratings_count
  ratings_distribution
  cached_tags
  cached_contributors
`;

const EDITION_QUERY = `
  query HardcoverEditionByAsin($asin: String!) {
    editions(where: { asin: { _eq: $asin } }, order_by: { score: desc }, limit: 5) {
      asin
      title
      book { ${BOOK_FIELDS} }
    }
  }
`;

const SEARCH_QUERY = `
  query HardcoverSearch($query: String!) {
    search(query: $query, query_type: "Book", page: 1, per_page: ${SEARCH_LIMIT}) {
      error
      results
    }
  }
`;

const BOOK_QUERY = `
  query HardcoverBook($id: Int!) {
    books_by_pk(id: $id) { ${BOOK_FIELDS} }
  }
`;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function authorization(apiKey) {
  const key = apiKey?.trim();
  if (!key) throw new Error('HARDCOVER_API_KEY fehlt.');
  return key.startsWith('Bearer ') ? key : `Bearer ${key}`;
}

async function hardcoverRequest(query, variables, { apiKey, fetchImpl = fetch, onRequest } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    onRequest?.();
    const response = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization(apiKey),
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && !body.errors?.length) return body.data;

    const message = body.errors?.map((error) => error.message).join('; ')
      || `Hardcover HTTP ${response.status}`;
    lastError = new Error(message);
    if (response.status !== 429 && response.status < 500) break;
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1_000 : 1_500 * (attempt + 1));
  }
  throw lastError;
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(normalizeBookMetadata(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeBookMetadata(right).split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

function titleSimilarity(candidate, requested) {
  const variants = (value) => [...new Set([
    value,
    value.split(':', 1)[0],
    value.split(/\s[-–—]\s/, 1)[0],
  ].map(normalizeBookMetadata).filter(Boolean))];
  const candidateTitles = variants(candidate);
  const requestedTitles = variants(requested);
  let best = 0;
  for (const candidateTitle of candidateTitles) {
    for (const requestedTitle of requestedTitles) {
      if (candidateTitle === requestedTitle) {
        const isFullMatch = candidateTitle === candidateTitles[0] && requestedTitle === requestedTitles[0];
        best = Math.max(best, isFullMatch ? 1 : 0.94);
        continue;
      }
      const containment = candidateTitle.includes(requestedTitle) || requestedTitle.includes(candidateTitle);
      best = Math.max(best, Math.min(1, tokenSimilarity(candidateTitle, requestedTitle) + (containment ? 0.18 : 0)));
    }
  }
  return best;
}

function authorSimilarity(candidateAuthors, requestedAuthor) {
  const requested = normalizeBookMetadata(requestedAuthor);
  if (!requested) return 0.7;
  return Math.max(0, ...(candidateAuthors || []).map((candidate) => {
    const normalized = normalizeBookMetadata(candidate);
    if (normalized === requested) return 1;
    return tokenSimilarity(normalized, requested);
  }));
}

function contributorNames(cachedContributors) {
  const values = Array.isArray(cachedContributors) ? cachedContributors : [];
  return values
    .map((entry) => entry?.author?.name || entry?.name)
    .filter((name) => typeof name === 'string' && name.trim());
}

function candidateScore(document, requestedTitle, requestedAuthor) {
  const titles = [document.title, ...(document.alternative_titles || [])].filter(Boolean);
  const titleScore = Math.max(0, ...titles.map((title) => titleSimilarity(title, requestedTitle)));
  const authors = document.author_names || contributorNames(document.cached_contributors);
  const authorScore = authorSimilarity(authors, requestedAuthor);
  return {
    titleScore,
    authorScore,
    score: titleScore * 0.78 + authorScore * 0.22,
  };
}

export function chooseHardcoverSearchResult(hits, title, author) {
  const ranked = (hits || [])
    .map((hit) => hit.document || hit)
    .filter((document) => document?.id && document?.title)
    .map((document) => ({ document, ...candidateScore(document, title, author) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.titleScore < 0.72 || best.authorScore < 0.5 || best.score < 0.79) return null;
  return { document: best.document, confidence: Math.min(1, best.score) };
}

function tagsForCategory(cachedTags, category, limit = 8) {
  const entries = Array.isArray(cachedTags?.[category]) ? cachedTags[category] : [];
  const seen = new Set();
  return entries
    .filter((entry) => entry && typeof entry.tag === 'string')
    .sort((left, right) => Number(right.count || 0) - Number(left.count || 0))
    .map((entry) => entry.tag.trim())
    .filter((tag) => tag && !seen.has(tag.toLocaleLowerCase()) && seen.add(tag.toLocaleLowerCase()))
    .slice(0, limit);
}

function validRatingDistribution(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => Number(entry?.rating) >= 0.5 && Number(entry?.rating) <= 5 && Number(entry?.count) >= 0)
    .map((entry) => ({ rating: Number(entry.rating), count: Number(entry.count) }));
}

export function plainTextDescription(value) {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<li(?:\s[^>]*)?>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return text || null;
}

export function extractHardcoverMetadata(book, confidence) {
  const ratingsCount = Number(book.ratings_count || 0);
  const rating = ratingsCount > 0 && Number(book.rating) > 0 ? Number(book.rating) : null;
  return {
    hardcoverBookId: Number(book.id),
    slug: typeof book.slug === 'string' ? book.slug : null,
    description: plainTextDescription(book.description),
    genres: tagsForCategory(book.cached_tags, 'Genre'),
    moods: tagsForCategory(book.cached_tags, 'Mood'),
    tags: tagsForCategory(book.cached_tags, 'Tag'),
    rating,
    ratingsCount,
    ratingsDistribution: validRatingDistribution(book.ratings_distribution),
    confidence,
  };
}

async function lookupByAsin(book, options) {
  if (!book.asin) return null;
  const data = await hardcoverRequest(EDITION_QUERY, { asin: book.asin }, options);
  const candidates = (data.editions || []).map((edition) => edition.book).filter(Boolean);
  if (!candidates.length) return null;
  const title = queryBookTitle(book.title);
  const author = queryBookAuthor(book.authors || '');
  const ranked = candidates
    .map((candidate) => ({ candidate, ...candidateScore(candidate, title, author) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (best.titleScore < 0.55 || best.authorScore < 0.5) return null;
  return { id: Number(best.candidate.id), confidence: Math.max(0.96, best.score) };
}

async function lookupBySearch(book, options) {
  const title = queryBookTitle(book.title);
  const author = queryBookAuthor(book.authors || '');
  const query = [title, author].filter(Boolean).join(' ');
  let data = await hardcoverRequest(SEARCH_QUERY, { query }, options);
  if (data.search?.error && author) {
    data = await hardcoverRequest(SEARCH_QUERY, { query: title }, options);
  }
  const shortTitle = title.split(':', 1)[0].split(/\s[-–—]\s/, 1)[0].trim();
  if (data.search?.error && shortTitle !== title) {
    data = await hardcoverRequest(SEARCH_QUERY, {
      query: [shortTitle, author].filter(Boolean).join(' '),
    }, options);
  }
  if (data.search?.error) throw new Error(data.search.error);
  const match = chooseHardcoverSearchResult(data.search?.results?.hits, title, author);
  return match ? { id: Number(match.document.id), confidence: match.confidence } : null;
}

async function lookupHardcoverBook(book, options) {
  const exact = await lookupByAsin(book, options);
  const match = exact || await lookupBySearch(book, options);
  if (!match) return null;
  const data = await hardcoverRequest(BOOK_QUERY, { id: match.id }, options);
  return data.books_by_pk ? extractHardcoverMetadata(data.books_by_pk, match.confidence) : null;
}

export async function enrichHardcoverMetadata({
  path = databasePath,
  limit,
  ids = [],
  retry = false,
  apiKey = process.env.HARDCOVER_API_KEY,
  delayMs = Number(process.env.HARDCOVER_DELAY_MS || DEFAULT_DELAY_MS),
  fetchImpl = fetch,
} = {}) {
  authorization(apiKey);
  const database = openDatabase(path);
  migrate(database);
  const selectedIds = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0);
  const idPredicate = selectedIds.length
    ? `AND id IN (${selectedIds.map(() => '?').join(', ')})`
    : '';
  const retryPredicate = retry || selectedIds.length ? '' : 'AND hardcover_lookup_at IS NULL';
  const limitClause = limit ? 'LIMIT ?' : '';
  const books = database.prepare(`
    SELECT id, asin, title, authors
    FROM books
    WHERE title <> '' AND authors IS NOT NULL AND authors <> '' ${idPredicate} ${retryPredicate}
    ORDER BY id
    ${limitClause}
  `).all(...selectedIds, ...(limit ? [limit] : []));
  const saveMatch = database.prepare(`
    UPDATE books SET
      hardcover_book_id = ?, hardcover_slug = ?, hardcover_description = ?,
      hardcover_genres = ?, hardcover_moods = ?, hardcover_tags = ?,
      hardcover_rating = ?, hardcover_ratings_count = ?, hardcover_ratings_distribution = ?,
      hardcover_match_confidence = ?, hardcover_lookup_at = ?, hardcover_enriched_at = ?, updated_at = ?
    WHERE id = ?
  `);
  const saveMiss = database.prepare(`
    UPDATE books SET hardcover_lookup_at = ?, hardcover_match_confidence = NULL, updated_at = ?
    WHERE id = ?
  `);
  let matched = 0;
  let unmatched = 0;
  let errors = 0;
  let requests = 0;
  const requestOptions = { apiKey, fetchImpl, onRequest: () => { requests += 1; } };

  try {
    for (const [index, book] of books.entries()) {
      try {
        const metadata = await lookupHardcoverBook(book, requestOptions);
        const now = new Date().toISOString();
        if (metadata) {
          saveMatch.run(
            metadata.hardcoverBookId,
            metadata.slug,
            metadata.description,
            JSON.stringify(metadata.genres),
            JSON.stringify(metadata.moods),
            JSON.stringify(metadata.tags),
            metadata.rating,
            metadata.ratingsCount,
            JSON.stringify(metadata.ratingsDistribution),
            metadata.confidence,
            now,
            now,
            now,
            book.id,
          );
          matched += 1;
          console.log(`[${index + 1}/${books.length}] ✓ ${book.title}`);
        } else {
          saveMiss.run(now, now, book.id);
          unmatched += 1;
          console.log(`[${index + 1}/${books.length}] – Kein sicherer Treffer: ${book.title}`);
        }
      } catch (error) {
        errors += 1;
        console.error(`[${index + 1}/${books.length}] ! ${book.title}: ${error.message}`);
      }
      if (index < books.length - 1 && delayMs > 0) await sleep(delayMs);
    }
    database.exec('PRAGMA optimize');
  } finally {
    database.close();
  }
  return { checked: books.length, matched, unmatched, errors, requests };
}
