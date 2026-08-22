import assert from 'node:assert/strict';
import test from 'node:test';
import { ShuffleBag } from '../src/shuffle-bag.js';

test('shuffle bag returns every item once before starting a new permutation', () => {
  const randomValues = [0.72, 0.14, 0.91, 0.38, 0.55, 0.03];
  let randomIndex = 0;
  const bag = new ShuffleBag(() => randomValues[randomIndex++ % randomValues.length]);
  const books = [1, 2, 3, 4, 5];

  const firstRound = books.map(() => bag.next(books));
  const secondRound = books.map(() => bag.next(books));

  assert.deepEqual([...firstRound].sort(), books);
  assert.deepEqual([...secondRound].sort(), books);
  assert.equal(new Set(firstRound).size, books.length);
  assert.equal(new Set(secondRound).size, books.length);
});

test('shuffle bag avoids an immediate repeat between permutations', () => {
  const bag = new ShuffleBag(() => 0);
  const books = [1, 2, 3];
  const firstRound = books.map(() => bag.next(books));
  const firstOfNextRound = bag.next(books);

  assert.notEqual(firstOfNextRound, firstRound.at(-1));
});

test('shuffle bag starts over when the visible books change', () => {
  const bag = new ShuffleBag(() => 0.5);
  bag.next([1, 2, 3]);

  const changedBooks = [4, 5];
  const round = changedBooks.map(() => bag.next(changedBooks));

  assert.deepEqual([...round].sort(), changedBooks);
});
