import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { coversPath, databasePath } from '../config.js';
import { migrate, openDatabase } from '../database.js';
import { dominantSpineColor } from './enrich-colors.js';
import {
  authorMatches, normalizeBookMetadata, queryBookAuthor, queryBookTitle,
} from './enrich-pages.js';
import {
  analyzeTypographyBook, assertTypographyServer, createSequentialTypographyState,
  finalizeSequentialTypography, saveTypographyResult,
} from './enrich-typography.js';

const USER_AGENT = 'Buecherregal/0.1 (https://github.com/kagsteiner/Buecherregal; private local library)';
const DEFAULT_BASE_URL = 'http://127.0.0.1:1234/v1';
const DEFAULT_MODEL = 'bookshelf-vision';
const OPEN_LIBRARY_INTERVAL_MS = 1_100;
let lastOpenLibraryRequest = 0;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openLibraryFetch(url) {
  const remaining = OPEN_LIBRARY_INTERVAL_MS - (Date.now() - lastOpenLibraryRequest);
  if (remaining > 0) await wait(remaining);
  lastOpenLibraryRequest = Date.now();
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 429) {
    await wait(10_000);
    throw new Error('Open Library HTTP 429');
  }
  return response;
}

function titleSimilarity(left, right) {
  const leftWords = new Set(normalizeBookMetadata(left).split(' ').filter(Boolean));
  const rightWords = new Set(normalizeBookMetadata(right).split(' ').filter(Boolean));
  if (!leftWords.size || !rightWords.size) return 0;
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  return intersection / Math.max(leftWords.size, rightWords.size);
}

export function coreCoverTitle(title) {
  const cleaned = queryBookTitle(title)
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const [mainTitle, subtitle = ''] = cleaned.split(/:\s+/, 2);
  return subtitle && (subtitle.split(/\s+/).length >= 3 || cleaned.length > 55)
    ? mainTitle.trim()
    : cleaned;
}

export function chooseCoverMatch(docs, title, author) {
  const requestedTitle = normalizeBookMetadata(title);
  const ranked = docs
    .filter((doc) => Number.isInteger(doc.cover_i))
    .map((doc) => {
      const candidateTitle = normalizeBookMetadata(doc.title || '');
      const exactTitle = candidateTitle === requestedTitle;
      const relatedTitle = candidateTitle.includes(requestedTitle) || requestedTitle.includes(candidateTitle);
      const similarity = titleSimilarity(candidateTitle, requestedTitle);
      const titleScore = exactTitle ? 5 : similarity >= 0.75 ? 4 : relatedTitle ? 3 : 0;
      const sameAuthor = authorMatches(doc.author_name, author);
      return { doc, score: titleScore + (sameAuthor ? 3 : 0), titleScore };
    })
    .sort((left, right) => right.score - left.score || right.titleScore - left.titleScore);
  const best = ranked[0];
  if (!best || best.score < 7) return null;
  return { ...best.doc, matchConfidence: Math.min(1, best.score / 8) };
}

async function lookupCover(book) {
  const title = coreCoverTitle(book.title);
  const author = queryBookAuthor(book.authors || '');
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('title', title);
  if (author) url.searchParams.set('author', author);
  url.searchParams.set('fields', 'key,title,author_name,cover_i');
  url.searchParams.set('limit', '5');
  const response = await openLibraryFetch(url);
  if (!response.ok) throw new Error(`Open Library search HTTP ${response.status}`);
  const body = await response.json();
  return chooseCoverMatch(body.docs || [], title, author);
}

async function downloadCover(coverId) {
  const url = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`;
  const response = await openLibraryFetch(url);
  if (!response.ok) throw new Error(`Open Library cover HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.startsWith('image/')) {
    throw new Error('Open Library cover response is not an image.');
  }
  const source = Buffer.from(await response.arrayBuffer());
  if (source.length < 1_000) throw new Error('Open Library cover image is too small.');
  const metadata = await sharp(source, { failOn: 'warning' }).metadata();
  if ((metadata.width || 0) < 120 || (metadata.height || 0) < 120) {
    throw new Error('Open Library cover dimensions are too small.');
  }
  return sharp(source)
    .rotate()
    .resize({ width: 1_400, height: 2_000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function saveCoverFile(directory, filename, buffer) {
  await mkdir(directory, { recursive: true });
  const target = join(directory, filename);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, buffer);
  await rename(temporary, target);
}

function isPermanentCoverError(error) {
  return /cover HTTP 404|not an image|image is too small|dimensions are too small/i.test(error.message);
}

export async function enrichOpenLibraryCovers({
  path = databasePath,
  directory = coversPath,
  limit,
  retry = false,
  baseUrl = process.env.LM_STUDIO_BASE_URL || DEFAULT_BASE_URL,
  model = process.env.LM_STUDIO_MODEL || DEFAULT_MODEL,
} = {}) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  await assertTypographyServer(normalizedBaseUrl, model);
  const database = openDatabase(path);
  migrate(database);
  const lookupFilter = retry ? '' : 'AND cover_lookup_at IS NULL';
  const suffix = limit ? ' LIMIT ?' : '';
  const books = database.prepare(`
    SELECT id, asin, title, authors, cover_local_path FROM books
    WHERE cover_local_path IS NULL ${lookupFilter}
      AND authors IS NOT NULL AND authors <> ''
      AND ((asin IS NULL OR length(asin) <> 10)
        OR (cover_analyzed_at IS NOT NULL AND spine_color IS NULL))
    ORDER BY id${suffix}
  `).all(...(limit ? [limit] : []));
  const unfinishedTypography = database.prepare(`
    SELECT id, asin, title, authors, cover_local_path FROM books
    WHERE cover_source = 'openlibrary' AND cover_local_path IS NOT NULL
      AND typography_analyzed_at IS NULL
    ORDER BY id
  `).all();
  const markNotFound = database.prepare(`
    UPDATE books SET cover_lookup_at = ?, updated_at = ? WHERE id = ?
  `);
  const saveCover = database.prepare(`
    UPDATE books SET
      cover_local_path = ?, cover_source = 'openlibrary', cover_source_id = ?,
      cover_match_confidence = ?, cover_lookup_at = ?, cover_fetched_at = ?,
      spine_color = ?, spine_color_source = 'openlibrary-cover-dominant',
      cover_analyzed_at = ?, updated_at = ?
    WHERE id = ?
  `);
  const typographyState = createSequentialTypographyState();
  const stats = {
    checked: books.length, coversFound: 0, typographyAnalyzed: 0,
    resumedTypography: 0, notFound: 0, coverErrors: 0, typographyErrors: 0,
  };

  for (const book of unfinishedTypography) {
    try {
      const result = await analyzeTypographyBook(book, { baseUrl: normalizedBaseUrl, model });
      const final = finalizeSequentialTypography(result, typographyState);
      saveTypographyResult(database, { book, result, final, model });
      stats.typographyAnalyzed += 1;
      stats.resumedTypography += 1;
      console.log(`[Fortsetzung] ${book.title}: Typografie gespeichert`);
    } catch (error) {
      stats.typographyErrors += 1;
      console.error(`[Fortsetzung] ${book.title}: ${error.message}`);
    }
  }

  for (const [index, book] of books.entries()) {
    const label = `[${index + 1}/${books.length}] ${book.title}`;
    let localBook;
    try {
      const match = await lookupCover(book);
      if (!match) {
        const now = new Date().toISOString();
        markNotFound.run(now, now, book.id);
        stats.notFound += 1;
        console.log(`${label}: kein sicherer Cover-Treffer`);
        continue;
      }
      const cover = await downloadCover(match.cover_i);
      const color = await dominantSpineColor(cover);
      if (!color) throw new Error('No dominant cover color could be determined.');
      const filename = `${book.id}-openlibrary-${match.cover_i}.jpg`;
      await saveCoverFile(directory, filename, cover);
      const now = new Date().toISOString();
      saveCover.run(
        filename, String(match.cover_i), match.matchConfidence,
        now, now, color, now, now, book.id,
      );
      stats.coversFound += 1;
      localBook = { ...book, cover_local_path: filename };
      console.log(`${label}: Cover und Rückenfarbe gespeichert`);
    } catch (error) {
      if (isPermanentCoverError(error)) {
        const now = new Date().toISOString();
        markNotFound.run(now, now, book.id);
        stats.notFound += 1;
        console.log(`${label}: Cover dauerhaft unbrauchbar (${error.message})`);
      } else {
        stats.coverErrors += 1;
        console.error(`${label}: ${error.message}`);
      }
      continue;
    }

    try {
      const result = await analyzeTypographyBook(localBook, { baseUrl: normalizedBaseUrl, model });
      const final = finalizeSequentialTypography(result, typographyState);
      saveTypographyResult(database, { book: localBook, result, final, model });
      stats.typographyAnalyzed += 1;
      console.log(`${label}: Typografie gespeichert`);
    } catch (error) {
      stats.typographyErrors += 1;
      console.error(`${label}: Cover bleibt gespeichert; Typografie fehlgeschlagen: ${error.message}`);
    }
  }

  database.exec('PRAGMA optimize');
  database.close();
  return { ...stats, model };
}
