import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listBooks } from './books.js';

const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendFile(response, path) {
  response.statusCode = 200;
  response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
  createReadStream(path).pipe(response);
}

createServer((request, response) => {
  if (request.url === '/api/books') {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({ books: listBooks() }));
    return;
  }

  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '');
  const candidate = join(root, relative || 'index.html');
  if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(response, candidate);
    return;
  }
  sendFile(response, join(root, 'index.html'));
}).listen(port, '0.0.0.0', () => {
  console.log(`Bücherregal läuft auf http://localhost:${port}`);
});
