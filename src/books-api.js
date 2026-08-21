import { hideBook, listBooks, listHiddenBooks, unhideBooks } from './books.js';

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

export async function handleBooksApi(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/books')) return false;

  try {
    if (request.method === 'GET' && url.pathname === '/api/books') {
      sendJson(response, 200, { books: listBooks() });
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
