import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { hideBook, listBooks, listHiddenBooks, unhideBooks } from '../src/books.js';
import { migrate, openDatabase } from '../src/database.js';

test('books can be hidden and restored persistently', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'bookshelf-hidden-'));
  const path = join(directory, 'test.sqlite');
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = openDatabase(path);
  migrate(database);
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO books (source, source_id, title, authors, imported_at, updated_at)
    VALUES ('test', 'one', 'Visible Book', 'An Author', ?, ?)
  `).run(now, now);
  const id = Number(database.prepare('SELECT id FROM books').get().id);
  database.close();

  assert.equal(listBooks(path).length, 1);
  assert.equal(hideBook(id, path), 1);
  assert.equal(listBooks(path).length, 0);
  assert.equal(listHiddenBooks(path)[0].title, 'Visible Book');
  assert.equal(unhideBooks([id], path), 1);
  assert.equal(listHiddenBooks(path).length, 0);
  assert.equal(listBooks(path).length, 1);
});
