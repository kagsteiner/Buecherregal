import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectFacetOptions,
  filterBooks,
  hasActiveBookFilter,
  sanitizeBookFilter,
} from '../src/book-filter.js';

const books = [
  { title: 'Die Stadt', authors: 'Müller, Anna', description: 'Eine dunkle Zukunft.', genres: ['Dystopian', 'Science Fiction'], moods: ['dark', 'tense'], rating: 4.2 },
  { title: 'Der Garten', authors: 'Meier, Bert', description: 'Eine ruhige Familiengeschichte.', genres: ['Fiction'], moods: ['reflective'], rating: 3.7 },
  { title: 'Ohne Sterne', authors: 'Müller, Carla', description: null, genres: ['science fiction'], moods: ['hopeful'], rating: null },
];

test('book filters use AND between groups and OR within a facet group', () => {
  assert.deepEqual(
    filterBooks(books, { author: 'muller', genres: ['Fiction', 'Dystopian'], moods: ['dark', 'hopeful'] }).map((book) => book.title),
    ['Die Stadt'],
  );
  assert.deepEqual(
    filterBooks(books, { genres: ['Dystopian', 'Fiction'] }).map((book) => book.title),
    ['Die Stadt', 'Der Garten'],
  );
});

test('minimum rating excludes books without a rating', () => {
  assert.deepEqual(filterBooks(books, { minimumRating: 4 }).map((book) => book.title), ['Die Stadt']);
});

test('filter input is sanitized and active state is detected', () => {
  const filter = sanitizeBookFilter({ title: '  Stadt  ', genres: ['Fantasy', 'fantasy', ''], minimumRating: 9 });
  assert.deepEqual(filter, { title: 'Stadt', author: '', description: '', genres: ['Fantasy'], moods: [], minimumRating: null });
  assert.equal(hasActiveBookFilter(filter), true);
  assert.equal(hasActiveBookFilter({}), false);
});

test('facet options merge case variants and count books only once', () => {
  const options = collectFacetOptions([...books, { genres: ['1735854371786'] }], 'genres');
  const scienceFiction = options.find((option) => option.normalized === 'science fiction');
  assert.deepEqual(scienceFiction, { value: 'Science Fiction', normalized: 'science fiction', count: 2 });
  assert.equal(options.some((option) => option.value === '1735854371786'), false);
});
