import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { coversPath } from './config.js';
import { listBooks } from './books.js';

export const DEVELOPMENT_PUBLIC_TOKEN_SECRET = 'local-bookshelf-public-links-only';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function requestPrefix(request) {
  const value = request.headers['x-forwarded-prefix'];
  return typeof value === 'string' && /^\/[a-z0-9/_-]*$/i.test(value)
    ? value.replace(/\/$/, '')
    : '';
}

function publicOrigin(request) {
  const forwarded = request.headers['x-forwarded-proto'];
  const protocol = forwarded === 'https' || request.socket.encrypted === true ? 'https' : 'http';
  const suppliedHost = typeof request.headers.host === 'string' ? request.headers.host : '';
  const host = /^[a-z0-9.:[\]-]+$/i.test(suppliedHost) ? suppliedHost : 'localhost';
  return `${protocol}://${host}`;
}

export function publicBookToken(bookId, secret) {
  return createHmac('sha256', secret)
    .update(`public-book:${bookId}`)
    .digest('base64url')
    .slice(0, 24);
}

export function publicBookPath(book, secret) {
  return `/buch/${publicBookToken(book.id, secret)}`;
}

export function publicBookUrl(request, book, secret) {
  return new URL(`${requestPrefix(request)}${publicBookPath(book, secret)}`, publicOrigin(request)).toString();
}

function tokensEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function findPublicBook(token, secret, databasePath) {
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return null;
  return listBooks(databasePath).find((book) => tokensEqual(token, publicBookToken(book.id, secret))) || null;
}

function openLibraryUrl(book) {
  const url = new URL('https://openlibrary.org/search');
  url.searchParams.set('title', book.title);
  if (book.authors && book.authors !== 'Unbekannt') url.searchParams.set('author', book.authors.split(',')[0]);
  return url.toString();
}

function hardcoverUrl(book) {
  return book.hardcoverSlug
    ? `https://hardcover.app/books/${encodeURIComponent(book.hardcoverSlug)}`
    : 'https://hardcover.app/search';
}

function chipsMarkup(book) {
  const labels = [...book.genres.slice(0, 4), ...book.moods.slice(0, 2)];
  return labels.length
    ? `<div class="chips">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}</div>`
    : '';
}

function ratingMarkup(book) {
  if (book.rating === null || Number(book.ratingsCount) <= 0) return '';
  const rating = book.rating.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const count = Number(book.ratingsCount).toLocaleString('de-DE');
  return `<p class="rating"><strong>★ ${rating}</strong> · ${count} Bewertungen bei Hardcover</p>`;
}

function publicPage({ request, book, token, authenticated }) {
  const prefix = requestPrefix(request);
  const bookPath = `/buch/${token}`;
  const localBookPath = `${prefix}${bookPath}`;
  const familyLogin = `${prefix}/auth/login?next=${encodeURIComponent(bookPath)}`;
  const kindleAvailable = authenticated && /^[A-Z0-9]{10}$/i.test(book.asin || '');
  const pages = book.pageCountKnown ? `${book.pageCount} Seiten` : '';
  const amazonUrl = kindleAvailable ? `https://www.amazon.de/dp/${encodeURIComponent(book.asin)}` : '';
  const kindleUrl = kindleAvailable ? `kindle://book?action=open&asin=${encodeURIComponent(book.asin)}` : '';
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="noindex, nofollow" />
  <meta name="theme-color" content="#17120e" />
  <title>${escapeHtml(book.title)} · Unser Bücherregal</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #f4ecdf; background: #17120e; }
    * { box-sizing: border-box; }
    body { min-width: 300px; min-height: 100svh; margin: 0; background: radial-gradient(circle at 50% 10%, #392b21, #17120e 52%, #0d0a08); }
    main { width: min(920px, 100%); margin: 0 auto; padding: max(24px, env(safe-area-inset-top)) 22px max(40px, env(safe-area-inset-bottom)); }
    .eyebrow { margin: 0 0 10px; color: #c6a77c; font-size: .7rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
    .book { display: grid; grid-template-columns: minmax(130px, 260px) minmax(0, 1fr); gap: clamp(24px, 6vw, 64px); align-items: start; }
    .cover { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 3px 8px 8px 3px; background: #2d251d; box-shadow: 16px 24px 38px #0008; }
    h1 { margin: 0; font: 400 clamp(2.1rem, 7vw, 4.8rem)/.98 Georgia, serif; letter-spacing: -.025em; }
    .author { margin: 18px 0 7px; color: #d7c7b2; font-size: clamp(1rem, 3vw, 1.3rem); }
    .pages, .source { color: #938575; font-size: .78rem; }
    .description { margin: 24px 0 0; color: #d8cdbf; font-size: clamp(.92rem, 2.5vw, 1.05rem); line-height: 1.6; white-space: pre-line; }
    .chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 20px; }
    .chips span { padding: 6px 10px; border: 1px solid #c6a77c45; border-radius: 999px; color: #cdbda8; background: #c6a77c12; font-size: .72rem; }
    .rating { color: #9c8e7e; font-size: .76rem; }.rating strong { color: #e1bc76; font-size: 1rem; }
    .actions { display: grid; gap: 10px; margin-top: 28px; }
    .button { display: block; padding: 14px 17px; border: 1px solid #816f57; border-radius: 10px; color: #f1dfc5; background: #2d231b; font-weight: 720; text-align: center; text-decoration: none; }
    .button.primary { border-color: #c5a06e; color: #21160e; background: #d5aa75; }
    .button.kindle { border-color: #86b4be; color: #e8fbff; background: #24424a; }
    .family { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ffffff16; }
    .family p { margin: 0 0 10px; color: #95877a; font-size: .76rem; line-height: 1.45; }
    .family-login { color: #bfa98c; font-size: .78rem; }
    .fallback { color: #938575; font-size: .72rem; text-align: center; }
    @media (max-width: 620px) { .book { grid-template-columns: 34vw minmax(0, 1fr); gap: 20px; }.description, .chips, .rating, .actions, .family { grid-column: 1 / -1; }.cover { position: sticky; top: 18px; } h1 { font-size: clamp(1.8rem, 9vw, 3.2rem); } }
  </style>
</head>
<body>
  <main>
    <article class="book">
      <img class="cover" src="${localBookPath}/cover" alt="Cover von ${escapeHtml(book.title)}" />
      <header>
        <p class="eyebrow">Aus unserem Bücherregal</p>
        <h1>${escapeHtml(book.title)}</h1>
        <p class="author">${escapeHtml(book.authors)}</p>
        ${pages ? `<p class="pages">${pages}</p>` : ''}
      </header>
      ${book.description ? `<p class="description">${escapeHtml(book.description)}</p>` : ''}
      ${chipsMarkup(book)}
      ${ratingMarkup(book)}
      <nav class="actions" aria-label="Buch bei anderen Diensten ansehen">
        <a class="button primary" href="${escapeHtml(openLibraryUrl(book))}">Bei Open Library ansehen</a>
        <a class="button" href="${escapeHtml(hardcoverUrl(book))}">Bei Hardcover ansehen</a>
      </nav>
      <section class="family">
        ${kindleAvailable ? `
          <p>Nur für unsere Familie: Das Buch ist bereits in unserer Kindle-Bibliothek und kann direkt in der Kindle-App geöffnet werden.</p>
          <a class="button kindle" href="${kindleUrl}">In Kindle öffnen</a>
          <p class="fallback">Falls sich die App nicht öffnet: <a href="${amazonUrl}">bei Amazon ansehen</a>.</p>
        ` : authenticated ? `
          <p>Für dieses Buch ist leider kein Kindle-Direktlink hinterlegt.</p>
        ` : `
          <p>Familienmitglieder können sich anmelden, um dieses Buch direkt in Kindle zu öffnen.</p>
          <a class="family-login" href="${familyLogin}">Familienzugang</a>
        `}
      </section>
    </article>
  </main>
</body>
</html>`;
}

function sendCover(response, book) {
  if (book.coverUrl?.startsWith('covers/')) {
    const filename = decodeURIComponent(book.coverUrl.slice('covers/'.length));
    const path = resolve(coversPath, filename);
    if (path.startsWith(`${coversPath}${sep}`) && existsSync(path) && statSync(path).isFile()) {
      const type = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(path)] || 'application/octet-stream';
      response.statusCode = 200;
      response.setHeader('Content-Type', type);
      response.setHeader('Cache-Control', 'public, max-age=86400');
      createReadStream(path).pipe(response);
      return;
    }
  }
  if (book.coverUrl?.startsWith('https://')) {
    response.statusCode = 302;
    response.setHeader('Location', book.coverUrl);
    response.end();
    return;
  }
  response.statusCode = 404;
  response.end('Not found');
}

export async function handlePublicBook(request, response, { secret, authenticated = false, databasePath } = {}) {
  const url = new URL(request.url, 'http://localhost');
  const match = url.pathname.match(/^\/buch\/([A-Za-z0-9_-]{24})(\/cover)?\/?$/);
  if (!match || request.method !== 'GET') return false;
  const book = findPublicBook(match[1], secret, databasePath);
  if (!book) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end('Dieses Buch wurde nicht gefunden.');
    return true;
  }
  if (match[2]) {
    sendCover(response, book);
    return true;
  }
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  response.end(publicPage({ request, book, token: match[1], authenticated }));
  return true;
}

export const publicBookInternals = { publicPage, openLibraryUrl, hardcoverUrl };
