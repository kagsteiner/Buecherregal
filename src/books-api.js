import { hideBook, listBooks, listHiddenBooks, unhideBooks } from './books.js';
import QRCode from 'qrcode';
import { DEVELOPMENT_PUBLIC_TOKEN_SECRET, publicBookPath, publicBookUrl } from './public-books.js';

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function handleBooksApi(request, response, options = {}) {
  const url = new URL(request.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/books')) return false;
  const publicTokenSecret = options.publicTokenSecret || process.env.SESSION_SECRET || DEVELOPMENT_PUBLIC_TOKEN_SECRET;

  try {
    if (request.method === 'GET' && url.pathname === '/api/books') {
      const books = listBooks().map((book) => ({
        ...book,
        publicPath: publicBookPath(book, publicTokenSecret),
      }));
      sendJson(response, 200, { books });
      return true;
    }
    const qrMatch = request.method === 'GET' && url.pathname.match(/^\/api\/books\/(\d+)\/qr$/);
    if (qrMatch) {
      const book = listBooks().find((entry) => entry.id === Number(qrMatch[1]));
      if (!book) {
        sendJson(response, 404, { error: 'Nicht gefunden.' });
        return true;
      }
      const svg = await QRCode.toString(publicBookUrl(request, book, publicTokenSecret), {
        type: 'svg', margin: 1, errorCorrectionLevel: 'M',
        color: { dark: '#17120eff', light: '#f4ecdf00' },
      });
      response.statusCode = 200;
      response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      response.setHeader('Cache-Control', 'private, max-age=3600');
      response.end(svg);
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/books/hidden') {
      sendJson(response, 200, { books: listHiddenBooks() });
      return true;
    }
    const hideMatch = request.method === 'POST' && url.pathname.match(/^\/api\/books\/(\d+)\/hide$/);
    if (hideMatch) {
      const id = Number(hideMatch[1]);
      const changed = hideBook(id);
      sendJson(response, changed ? 200 : 404, { changed });
      return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/books/unhide') {
      const body = await readJson(request);
      if (!Array.isArray(body.ids)) {
        sendJson(response, 400, { error: 'Mindestens eine gültige Buch-ID ist erforderlich.' });
        return true;
      }
      const ids = [...new Set(body.ids)]
        .filter((id) => Number.isSafeInteger(id) && id > 0)
        .slice(0, 1000);
      if (ids.length === 0) {
        sendJson(response, 400, { error: 'Mindestens eine gültige Buch-ID ist erforderlich.' });
        return true;
      }
      sendJson(response, 200, { changed: unhideBooks(ids) });
      return true;
    }
    sendJson(response, 404, { error: 'Nicht gefunden.' });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    sendJson(response, status, { error: status === 400 ? 'Ungültiges JSON.' : 'Interner Fehler.' });
  }
  return true;
}
