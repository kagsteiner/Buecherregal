import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import sharp from 'sharp';
import { localCoverUrl } from './books.js';
import { coversPath, databasePath } from './config.js';
import { migrate, openDatabase } from './database.js';
import { dominantSpineColor } from './metadata/enrich-colors.js';
import {
  analyzeTypographyBook, assertTypographyServer, finalizeSequentialTypography,
  saveTypographyResult,
} from './metadata/enrich-typography.js';

const MAX_COVER_BYTES = 12 * 1024 * 1024;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function isPrivateAddress(address) {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  const ipv4 = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
  if (isIP(ipv4) !== 4) return false;
  const [a, b] = ipv4.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

export async function validateRemoteCoverUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Bitte eine vollständige Cover-URL eingeben.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Die Cover-URL muss mit http:// oder https:// beginnen.');
  }
  if (url.username || url.password) throw new Error('URLs mit Zugangsdaten werden nicht unterstützt.');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw new Error('Lokale Adressen sind als Cover-Quelle nicht erlaubt.');
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Die Cover-URL verweist auf eine lokale oder private Adresse.');
  }
  return url;
}

async function fetchRemoteCover(value) {
  let url = await validateRemoteCoverUrl(value);
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Buecherregal-Cover-Review/0.1 (private local tool)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (REDIRECT_CODES.has(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === 5) throw new Error('Zu viele oder ungültige Weiterleitungen.');
      url = await validateRemoteCoverUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Cover-Download HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.startsWith('image/')) {
      throw new Error('Die URL liefert kein Bild.');
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_COVER_BYTES) throw new Error('Das Cover ist größer als 12 MB.');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_COVER_BYTES) throw new Error('Das Cover ist größer als 12 MB.');
      chunks.push(chunk);
    }
    return { buffer: Buffer.concat(chunks), sourceUrl: url.toString() };
  }
  throw new Error('Cover-Download fehlgeschlagen.');
}

async function normalizeCover(buffer) {
  const metadata = await sharp(buffer, { failOn: 'warning' }).metadata();
  if ((metadata.width || 0) < 120 || (metadata.height || 0) < 120) {
    throw new Error('Das Coverbild ist zu klein.');
  }
  return sharp(buffer)
    .rotate()
    .resize({ width: 1_400, height: 2_000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

const MISSING_COVER_FILTER = `
  ((cover_local_path IS NULL AND (
      asin IS NULL OR length(asin) <> 10 OR (cover_analyzed_at IS NOT NULL AND spine_color IS NULL)
    )) OR (
      cover_source = 'manual-url' AND cover_local_path IS NOT NULL AND typography_analyzed_at IS NULL
    ))
`;

export function listMissingCoverBooks(path = databasePath) {
  const database = openDatabase(path);
  migrate(database);
  const books = database.prepare(`
    SELECT id, title, authors, cover_local_path
    FROM books
    WHERE title <> '' AND ${MISSING_COVER_FILTER}
    ORDER BY title COLLATE NOCASE
  `).all().map((book) => ({
    id: book.id,
    title: book.title,
    authors: book.authors || 'Unbekannt',
    existingCoverUrl: localCoverUrl(book.cover_local_path),
  }));
  database.close();
  return books;
}

export async function processManualCover({
  bookId,
  url,
  typographyState,
  path = databasePath,
  directory = coversPath,
  baseUrl = process.env.LM_STUDIO_BASE_URL || 'http://127.0.0.1:1234/v1',
  model = process.env.LM_STUDIO_MODEL || 'google/gemma-4-12b',
  onStage = () => {},
}) {
  const database = openDatabase(path);
  migrate(database);
  try {
    const book = database.prepare(`
      SELECT id, asin, title, authors, cover_local_path FROM books
      WHERE id = ? AND ${MISSING_COVER_FILTER}
    `).get(bookId);
    if (!book) throw new Error('Das Buch benötigt kein manuelles Cover mehr.');

    onStage('Cover wird geladen');
    const downloaded = await fetchRemoteCover(url);
    const cover = await normalizeCover(downloaded.buffer);
    const color = await dominantSpineColor(cover);
    if (!color) throw new Error('Aus dem Cover konnte keine Rückenfarbe ermittelt werden.');
    const fingerprint = createHash('sha256').update(downloaded.sourceUrl).digest('hex').slice(0, 12);
    const filename = `${book.id}-manual-${fingerprint}.jpg`;
    await mkdir(directory, { recursive: true });
    const target = join(directory, filename);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, cover);
    await rename(temporary, target);
    const now = new Date().toISOString();
    database.prepare(`
      UPDATE books SET
        cover_local_path = ?, cover_source = 'manual-url', cover_source_id = ?,
        cover_match_confidence = 1, cover_lookup_at = ?, cover_fetched_at = ?,
        spine_color = ?, spine_color_source = 'manual-cover-dominant',
        cover_analyzed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(filename, downloaded.sourceUrl, now, now, color, now, now, book.id);

    onStage('Typografie wird lokal analysiert');
    const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
    await assertTypographyServer(normalizedBaseUrl, model);
    const localBook = { ...book, cover_local_path: filename };
    const result = await analyzeTypographyBook(localBook, { baseUrl: normalizedBaseUrl, model });
    const final = finalizeSequentialTypography(result, typographyState);
    saveTypographyResult(database, { book: localBook, result, final, model });
    return { bookId: book.id, coverUrl: localCoverUrl(filename), color };
  } finally {
    database.close();
  }
}
