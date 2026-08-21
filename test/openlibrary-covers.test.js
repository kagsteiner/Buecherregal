import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseCoverMatch, coreCoverTitle } from '../src/metadata/enrich-openlibrary-covers.js';

test('cover searches strip Kindle marketing subtitles and series suffixes', () => {
  assert.equal(
    coreCoverTitle('A Memory Called Empire: Winner of the Hugo Award (Teixcalaan Book 1) (English Edition)'),
    'A Memory Called Empire',
  );
  assert.equal(coreCoverTitle("The Emperor's Soul (Elantris Book 2) (English Edition)"), "The Emperor's Soul");
});

test('cover matching requires a cover plus a strong title and author match', () => {
  const docs = [
    { key: '/works/wrong-author', title: 'The Way of Kings', author_name: ['Someone Else'], cover_i: 11 },
    { key: '/works/no-cover', title: 'The Way of Kings', author_name: ['Brandon Sanderson'] },
    { key: '/works/correct', title: 'The Way of Kings', author_name: ['Brandon Sanderson'], cover_i: 42 },
  ];
  const match = chooseCoverMatch(docs, 'The Way of Kings', 'Brandon Sanderson');
  assert.equal(match.key, '/works/correct');
  assert.equal(match.cover_i, 42);
  assert.equal(match.matchConfidence, 1);
});

test('cover matching rejects plausible titles by another author', () => {
  const match = chooseCoverMatch([
    { title: 'Foundation', author_name: ['Another Writer'], cover_i: 42 },
  ], 'Foundation', 'Isaac Asimov');
  assert.equal(match, null);
});
