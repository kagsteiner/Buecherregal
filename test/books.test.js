import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanTitle, coverUrl, deterministicPageCount } from '../src/books.js';
import { choosePageCount } from '../src/metadata/enrich-pages.js';

test('deterministic page fallback stays stable and in the agreed range', () => {
  assert.equal(deterministicPageCount('book-42'), deterministicPageCount('book-42'));
  assert.ok(deterministicPageCount('book-42') >= 300);
  assert.ok(deterministicPageCount('book-42') <= 600);
});

test('page metadata requires a strong title and author match', () => {
  const docs = [{
    key: '/works/OL1W',
    title: 'Inflight Science',
    author_name: ['Brian Clegg'],
    number_of_pages_median: 240,
  }];
  assert.equal(choosePageCount(docs, 'Inflight Science', 'Brian Clegg')?.number_of_pages_median, 240);
  assert.equal(choosePageCount(docs, 'A Different Book', 'Brian Clegg'), null);
});

test('document titles are cleaned for display', () => {
  assert.equal(cleanTitle('Meine_Datei_for_Kindle'), 'Meine Datei');
  assert.equal(cleanTitle('600 Hours of Edward (English Edition)'), '600 Hours of Edward');
});

test('cover URLs are only generated for plausible ASINs', () => {
  assert.match(coverUrl('B004TGTW3W'), /B004TGTW3W/);
  assert.equal(coverUrl('not-an-asin'), null);
});
