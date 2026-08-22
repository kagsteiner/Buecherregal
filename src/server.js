import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleBooksApi } from './books-api.js';
import { authConfiguration, createAuthHandler } from './auth.js';
import { coversPath } from './config.js';

const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
const port = Number(process.env.PORT || 3040);
const host = process.env.HOST || '0.0.0.0';
const handleAuth = createAuthHandler(authConfiguration());
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendFile(response, path) {
  response.statusCode = 200;
  response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
  createReadStream(path).pipe(response);
}

createServer(async (request, response) => {
  if (!await handleAuth(request, response)) return;
  if (await handleBooksApi(request, response)) return;

  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname.startsWith('/covers/')) {
    const requested = resolve(coversPath, pathname.slice('/covers/'.length));
    if (requested.startsWith(`${coversPath}${sep}`) && existsSync(requested) && statSync(requested).isFile()) {
      sendFile(response, requested);
    } else {
      response.statusCode = 404;
      response.end('Not found');
    }
    return;
  }
  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '');
  const candidate = join(root, relative || 'index.html');
  if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(response, candidate);
    return;
  }
  sendFile(response, join(root, 'index.html'));
}).listen(port, host, () => {
  console.log(`Bücherregal läuft auf http://${host}:${port}`);
});
