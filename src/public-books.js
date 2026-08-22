import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { coversPath, projectRoot } from './config.js';
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

function publicPage({ request, book, token }) {
  const prefix = requestPrefix(request);
  const bookPath = `/buch/${token}`;
  const localBookPath = `${prefix}${bookPath}`;
  const pages = book.pageCountKnown ? `${book.pageCount} Seiten` : '';
  const libraryUrl = `${prefix}/merkliste`;
  const openLibrary = openLibraryUrl(book);
  const hardcover = hardcoverUrl(book);
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
    .button { display: block; width: 100%; padding: 14px 17px; border: 1px solid #816f57; border-radius: 10px; color: #f1dfc5; background: #2d231b; font: inherit; font-weight: 720; text-align: center; text-decoration: none; cursor: pointer; }
    .button.primary { border-color: #c5a06e; color: #21160e; background: #d5aa75; }
    .button.saved { border-color: #789879; color: #e8f5e6; background: #29432e; }
    .list-link { display: block; margin-top: 13px; color: #c9ad88; font-size: .82rem; text-align: center; }
    .bookmark-hint { margin-top: 20px; padding: 15px; border: 1px solid #8c714d66; border-radius: 10px; color: #b9aa98; background: #211a14; font-size: .78rem; line-height: 1.5; }
    .bookmark-hint strong { display: block; margin-bottom: 4px; color: #e5d2b8; }
    .bookmark-hint[hidden] { display: none; }
    @media (max-width: 620px) { .book { grid-template-columns: 34vw minmax(0, 1fr); gap: 20px; }.description, .chips, .rating, .actions { grid-column: 1 / -1; }.cover { position: sticky; top: 18px; } h1 { font-size: clamp(1.8rem, 9vw, 3.2rem); } }
  </style>
</head>
<body data-page="book" data-prefix="${prefix}">
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
      <nav class="actions" aria-label="Buch merken oder bei anderen Diensten ansehen">
        <button
          class="button primary"
          type="button"
          data-save-book
          data-token="${token}"
          data-title="${escapeHtml(book.title)}"
          data-authors="${escapeHtml(book.authors)}"
          data-book-path="${localBookPath}"
          data-cover-path="${localBookPath}/cover"
          data-open-library="${escapeHtml(openLibrary)}"
          data-hardcover="${escapeHtml(hardcover)}"
        >Auf diesem Handy merken</button>
        <a class="button" href="${escapeHtml(openLibrary)}">Bei Open Library ansehen</a>
        <a class="button" href="${escapeHtml(hardcover)}">Bei Hardcover ansehen</a>
        <a class="list-link" href="${libraryUrl}">Meine Leseliste <span data-list-count></span></a>
      </nav>
      <aside class="bookmark-hint" data-bookmark-hint hidden>
        <strong>Damit du die Liste später wiederfindest</strong>
        Speichere „Meine Leseliste“ als Lesezeichen in diesem Browser. Die genaue Anleitung findest du in deiner Leseliste.
      </aside>
    </article>
  </main>
  <script src="${prefix}/reading-list.js" defer></script>
</body>
</html>`;
}

function readingListPage(request) {
  const prefix = requestPrefix(request);
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="noindex, nofollow" />
  <meta name="theme-color" content="#17120e" />
  <title>Meine Leseliste · Unser Bücherregal</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #f4ecdf; background: #17120e; }
    * { box-sizing: border-box; }
    body { min-width: 300px; min-height: 100svh; margin: 0; background: radial-gradient(circle at 50% 7%, #392b21, #17120e 50%, #0d0a08); }
    main { width: min(760px, 100%); margin: 0 auto; padding: max(34px, env(safe-area-inset-top)) 20px max(48px, env(safe-area-inset-bottom)); }
    .eyebrow { margin: 0 0 9px; color: #c6a77c; font-size: .7rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
    h1 { margin: 0; font: 400 clamp(2.7rem, 10vw, 5rem)/.95 Georgia, serif; letter-spacing: -.03em; }
    .intro { max-width: 42em; margin: 17px 0 28px; color: #a99a89; font-size: .88rem; line-height: 1.55; }
    .reading-list { display: grid; gap: 12px; }
    .reading-item { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 16px; padding: 13px; border: 1px solid #ffffff16; border-radius: 12px; background: #211a15d9; }
    .reading-item img { width: 76px; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 2px 5px 5px 2px; background: #30261e; }
    .reading-item h2 { margin: 2px 0 5px; color: #eee1cf; font: 400 1.22rem/1.12 Georgia, serif; }
    .reading-item .author { margin: 0 0 13px; color: #9f9181; font-size: .76rem; }
    .item-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .item-actions a, .item-actions button { padding: 7px 9px; border: 1px solid #755f48; border-radius: 7px; color: #d8c2a4; background: transparent; font: inherit; font-size: .68rem; text-decoration: none; cursor: pointer; }
    .item-actions .remove { border-color: #70483e; color: #cda89c; }
    .empty { padding: 26px; border: 1px dashed #806c54; border-radius: 12px; color: #9e8e7c; text-align: center; }
    .bookmark { margin-top: 30px; padding: 20px; border: 1px solid #8c714d55; border-radius: 12px; background: #211a14; }
    .bookmark h2 { margin: 0 0 9px; font: 400 1.45rem Georgia, serif; }
    .bookmark p, .bookmark li { color: #aa9a88; font-size: .78rem; line-height: 1.5; }
    .bookmark ol { margin: 10px 0 0; padding-left: 20px; }
    .privacy { margin-top: 18px; color: #756a5f; font-size: .68rem; line-height: 1.45; }
    @media (max-width: 480px) { .reading-item { grid-template-columns: 64px minmax(0, 1fr); gap: 12px; padding: 10px; }.reading-item img { width: 64px; } }
  </style>
</head>
<body data-page="list" data-prefix="${prefix}">
  <main>
    <p class="eyebrow">Unser Bücherregal</p>
    <h1>Meine Leseliste</h1>
    <p class="intro">Diese Bücher hast du auf diesem Handy gemerkt. Nimm die Liste später mit zu deinem Kindle und suche dort nach Titel oder Autor.</p>
    <section class="reading-list" data-reading-list aria-live="polite"></section>
    <section class="bookmark">
      <h2>Später schnell wiederfinden</h2>
      <p>Speichere diese Seite als normales Lesezeichen. Wichtig: Öffne das Lesezeichen später im selben Browser, denn nur dort liegt deine persönliche Leseliste.</p>
      <ol>
        <li><strong>iPhone/iPad (Safari):</strong> Auf „Teilen“ tippen und „Lesezeichen hinzufügen“ wählen.</li>
        <li><strong>Android:</strong> Im Menü deines Browsers den Stern oder „Lesezeichen hinzufügen“ wählen.</li>
      </ol>
    </section>
    <p class="privacy">Die Liste wird ausschließlich in diesem Browser gespeichert. Andere Geräte und Browser haben eigene Listen. Beim Löschen der Browserdaten wird auch diese Liste gelöscht.</p>
  </main>
  <script src="${prefix}/reading-list.js" defer></script>
</body>
</html>`;
}

function sendPublicAsset(response, filename, contentType, extraHeaders = {}) {
  const path = resolve(projectRoot, 'public', filename);
  if (!path.startsWith(`${resolve(projectRoot, 'public')}${sep}`) || !existsSync(path) || !statSync(path).isFile()) {
    response.statusCode = 404;
    response.end('Not found');
    return;
  }
  response.statusCode = 200;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'public, max-age=3600');
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  createReadStream(path).pipe(response);
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

export async function handlePublicBook(request, response, { secret, databasePath } = {}) {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/reading-list.js') {
    sendPublicAsset(response, 'reading-list.js', 'text/javascript; charset=utf-8');
    return true;
  }
  if (request.method === 'GET' && /^\/merkliste\/?$/.test(url.pathname)) {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self' https:; base-uri 'none'; frame-ancestors 'none'");
    response.end(readingListPage(request));
    return true;
  }
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
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self' https:; base-uri 'none'; frame-ancestors 'none'");
  response.end(publicPage({ request, book, token: match[1] }));
  return true;
}

export const publicBookInternals = { publicPage, readingListPage, openLibraryUrl, hardcoverUrl };
