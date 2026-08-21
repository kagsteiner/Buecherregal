import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coversPath } from './config.js';
import { listMissingCoverBooks, processManualCover } from './manual-cover-service.js';
import { createSequentialTypographyState } from './metadata/enrich-typography.js';

const host = '127.0.0.1';
const port = Number(process.env.COVER_REVIEW_PORT || 3041);
const uiRoot = fileURLToPath(new URL('../cover-review/', import.meta.url));
const jobs = new Map();
const typographyState = createSequentialTypographyState();
let queue = Promise.resolve();

const types = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg',
};

function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

function sendFile(response, path) {
  response.statusCode = 200;
  response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
  createReadStream(path).pipe(response);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_000) throw new Error('Anfrage ist zu groß.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function publicJob(job) {
  const { url, ...safe } = job;
  return safe;
}

function enqueue(bookId, url) {
  const job = { bookId, url, status: 'queued', message: 'Wartet auf Verarbeitung' };
  jobs.set(bookId, job);
  queue = queue.then(async () => {
    job.status = 'processing';
    try {
      const result = await processManualCover({
        bookId, url, typographyState,
        onStage: (message) => { job.message = message; },
      });
      Object.assign(job, result, { status: 'done', message: 'Cover und Buchrücken gespeichert' });
    } catch (error) {
      Object.assign(job, { status: 'error', message: error.message });
    }
  });
  return publicJob(job);
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${host}:${port}`);
    if (request.method === 'GET' && url.pathname === '/api/books') {
      sendJson(response, 200, {
        books: listMissingCoverBooks(),
        jobs: [...jobs.values()].map(publicJob),
      });
      return;
    }
    if (request.method === 'POST') {
      const match = url.pathname.match(/^\/api\/books\/(\d+)\/cover$/);
      if (match) {
        const bookId = Number(match[1]);
        const active = jobs.get(bookId);
        if (active && ['queued', 'processing'].includes(active.status)) {
          sendJson(response, 409, { error: 'Dieses Buch wird bereits verarbeitet.' });
          return;
        }
        const body = await readJson(request);
        if (typeof body.url !== 'string' || body.url.length > 4_000) {
          sendJson(response, 400, { error: 'Bitte eine gültige Cover-URL eingeben.' });
          return;
        }
        sendJson(response, 202, { job: enqueue(bookId, body.url.trim()) });
        return;
      }
    }
    if (url.pathname.startsWith('/covers/')) {
      const requested = resolve(coversPath, url.pathname.slice('/covers/'.length));
      if (requested.startsWith(`${coversPath}${sep}`) && existsSync(requested) && statSync(requested).isFile()) {
        sendFile(response, requested);
      } else sendJson(response, 404, { error: 'Cover nicht gefunden.' });
      return;
    }
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const candidate = resolve(uiRoot, relative);
    if (candidate.startsWith(uiRoot) && existsSync(candidate) && statSync(candidate).isFile()) {
      sendFile(response, candidate);
    } else sendJson(response, 404, { error: 'Nicht gefunden.' });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}).listen(port, host, () => {
  console.log(`Cover-Werkstatt läuft auf http://${host}:${port}`);
});
