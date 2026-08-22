import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseHardcoverSearchResult,
  extractHardcoverMetadata,
  plainTextDescription,
} from '../src/metadata/enrich-hardcover.js';

test('Hardcover matching requires title and author agreement', () => {
  const hits = [
    { document: { id: '1', title: "The Emperor's Soul", author_names: ['Another Author'] } },
    { document: { id: '2', title: "The Emperor's Soul", author_names: ['Brandon Sanderson'] } },
  ];
  const match = chooseHardcoverSearchResult(hits, "The Emperor's Soul", 'Brandon Sanderson');
  assert.equal(match?.document.id, '2');
  assert.ok(match.confidence > 0.95);
});

test('Hardcover matching accepts an exact alternative title but rejects unrelated books', () => {
  const matching = chooseHardcoverSearchResult([{
    document: {
      id: '3',
      title: 'Die Seele des Königs',
      alternative_titles: ["The Emperor's Soul"],
      author_names: ['Brandon Sanderson'],
    },
  }], "The Emperor's Soul", 'Brandon Sanderson');
  assert.equal(matching?.document.id, '3');

  const unrelated = chooseHardcoverSearchResult([{
    document: { id: '4', title: 'Mistborn', author_names: ['Brandon Sanderson'] },
  }], "The Emperor's Soul", 'Brandon Sanderson');
  assert.equal(unrelated, null);
});

test('Hardcover matching accepts a source that omits a real subtitle', () => {
  const match = chooseHardcoverSearchResult([{
    document: { id: '5', title: 'Tödliche Oliven', author_names: ['Tom Hillenbrand'] },
  }], 'Tödliche Oliven: Ein kulinarischer Krimi', 'Tom Hillenbrand');
  assert.equal(match?.document.id, '5');
  assert.ok(match.confidence > 0.9);
});

test('Hardcover metadata keeps useful tags and the full rating distribution', () => {
  const metadata = extractHardcoverMetadata({
    id: 427626,
    slug: 'the-emperors-soul',
    description: 'A magical forgery must save an empire.',
    rating: 4.38,
    ratings_count: 1307,
    ratings_distribution: [{ rating: 4.5, count: 73 }, { rating: 5, count: 611 }],
    cached_tags: {
      Genre: [{ tag: 'Fantasy', count: 9 }, { tag: 'Fiction', count: 3 }],
      Mood: [{ tag: 'Adventurous', count: 28 }],
      Tag: [{ tag: 'Strong Character Development', count: 32 }],
    },
  }, 0.97);

  assert.equal(metadata.hardcoverBookId, 427626);
  assert.deepEqual(metadata.genres, ['Fantasy', 'Fiction']);
  assert.deepEqual(metadata.moods, ['Adventurous']);
  assert.deepEqual(metadata.tags, ['Strong Character Development']);
  assert.deepEqual(metadata.ratingsDistribution, [{ rating: 4.5, count: 73 }, { rating: 5, count: 611 }]);
});

test('Hardcover descriptions are converted from simple HTML to readable text', () => {
  assert.equal(
    plainTextDescription('<p>Erster Absatz &amp; mehr.</p><p>Zweiter<br>Absatz.</p>'),
    'Erster Absatz & mehr.\n\nZweiter\nAbsatz.',
  );
});
