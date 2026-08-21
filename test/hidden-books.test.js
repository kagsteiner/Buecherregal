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
  database.prepare(`
    UPDATE books SET title_font_key = 'cinzel', author_font_key = 'inter',
      title_text_color = '#f1e7d0', author_text_color = '#ffffff', spine_layout = 'inline',
      title_font_weight = 700, author_font_weight = 500, title_letter_spacing = 0.04,
      author_letter_spacing = 0.02, title_case = 'uppercase', author_case = 'as-written',
      typography_confidence = 0.91, cover_local_path = '1-openlibrary-123.jpg',
      cover_source = 'openlibrary', cover_match_confidence = 1.0
    WHERE id = ?
  `).run(id);
  database.close();

  const visible = listBooks(path);
  assert.equal(visible.length, 1);
  assert.deepEqual({
    titleFontKey: visible[0].titleFontKey,
    authorFontKey: visible[0].authorFontKey,
    titleTextColor: visible[0].titleTextColor,
    spineLayout: visible[0].spineLayout,
    titleFontWeight: visible[0].titleFontWeight,
    titleLetterSpacing: visible[0].titleLetterSpacing,
    titleCase: visible[0].titleCase,
    typographyConfidence: visible[0].typographyConfidence,
    coverUrl: visible[0].coverUrl,
    coverSource: visible[0].coverSource,
  }, {
    titleFontKey: 'cinzel',
    authorFontKey: 'inter',
    titleTextColor: '#f1e7d0',
    spineLayout: 'inline',
    titleFontWeight: 700,
    titleLetterSpacing: 0.04,
    titleCase: 'uppercase',
    typographyConfidence: 0.91,
    coverUrl: '/covers/1-openlibrary-123.jpg',
    coverSource: 'openlibrary',
  });
  assert.equal(hideBook(id, path), 1);
  assert.equal(listBooks(path).length, 0);
  assert.equal(listHiddenBooks(path)[0].title, 'Visible Book');
  assert.equal(unhideBooks([id], path), 1);
  assert.equal(listHiddenBooks(path).length, 0);
  assert.equal(listBooks(path).length, 1);
});
