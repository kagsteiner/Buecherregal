import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { migrate, openDatabase } from '../src/database.js';
import { listMissingCoverBooks, validateRemoteCoverUrl } from '../src/manual-cover-service.js';

test('manual cover review lists only missing and unfinished manual covers', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'bookshelf-manual-covers-'));
  const path = join(directory, 'test.sqlite');
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openDatabase(path);
  migrate(database);
  const now = new Date().toISOString();
  const insert = database.prepare(`
    INSERT INTO books (source, source_id, asin, title, authors, imported_at, updated_at)
    VALUES ('test', ?, ?, ?, 'Test Author', ?, ?)
  `);
  insert.run('missing-no-asin', null, 'Missing No Asin', now, now);
  insert.run('amazon-cover', 'B123456789', 'Amazon Cover', now, now);
  insert.run('amazon-unavailable', 'B987654321', 'Amazon Unavailable', now, now);
  insert.run('local-complete', null, 'Local Complete', now, now);
  insert.run('manual-unfinished', null, 'Manual Unfinished', now, now);
  database.prepare(`
    UPDATE books SET cover_analyzed_at = ?, spine_color = NULL WHERE source_id = 'amazon-unavailable'
  `).run(now);
  database.prepare(`
    UPDATE books SET cover_local_path = 'complete.jpg', cover_source = 'openlibrary',
      typography_analyzed_at = ? WHERE source_id = 'local-complete'
  `).run(now);
  database.prepare(`
    UPDATE books SET cover_local_path = 'unfinished.jpg', cover_source = 'manual-url',
      typography_analyzed_at = NULL WHERE source_id = 'manual-unfinished'
  `).run();
  database.close();

  assert.deepEqual(listMissingCoverBooks(path).map((book) => book.title), [
    'Amazon Unavailable', 'Manual Unfinished', 'Missing No Asin',
  ]);
});

test('manual cover URLs reject local and non-web targets before download', async () => {
  await assert.rejects(validateRemoteCoverUrl('file:///tmp/cover.jpg'), /http:\/\//);
  await assert.rejects(validateRemoteCoverUrl('http://localhost:8080/cover.jpg'), /Lokale Adressen/);
  await assert.rejects(validateRemoteCoverUrl('http://127.0.0.1/cover.jpg'), /private Adresse/);
});
