import assert from 'node:assert/strict';
import test from 'node:test';
import {
  publicBookInternals,
  publicBookPath,
  publicBookToken,
  publicBookUrl,
} from '../src/public-books.js';

const secret = 's'.repeat(32);

test('public book tokens are stable, opaque and different for every book', () => {
  const first = publicBookToken(42, secret);
  assert.equal(first, publicBookToken(42, secret));
  assert.notEqual(first, publicBookToken(43, secret));
  assert.match(first, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(first.includes('42'), false);
});

test('public URLs honor HTTPS reverse-proxy prefixes', () => {
  const request = {
    headers: {
      host: 'srv706843.hstgr.cloud',
      'x-forwarded-proto': 'https',
      'x-forwarded-prefix': '/buecherregal',
    },
    socket: {},
  };
  const book = { id: 42 };
  assert.equal(publicBookPath(book, secret), `/buch/${publicBookToken(42, secret)}`);
  assert.equal(
    publicBookUrl(request, book, secret),
    `https://srv706843.hstgr.cloud/buecherregal/buch/${publicBookToken(42, secret)}`,
  );
});

test('guest pages prefer Open Library and keep Kindle behind family login', () => {
  const request = {
    url: '/buch/token',
    headers: { 'x-forwarded-prefix': '/buecherregal' },
    socket: {},
  };
  const book = {
    id: 42,
    title: 'The Stone Sky',
    authors: 'Jemisin, N. K.',
    asin: 'B01MSS7ZYG',
    pageCountKnown: false,
    description: 'Beschreibung',
    genres: ['Fantasy'],
    moods: [],
    rating: 4.3,
    ratingsCount: 1200,
    hardcoverSlug: 'the-stone-sky',
  };
  const guest = publicBookInternals.publicPage({ request, book, token: 'a'.repeat(24), authenticated: false });
  assert.ok(guest.indexOf('Bei Open Library ansehen') < guest.indexOf('Bei Hardcover ansehen'));
  assert.doesNotMatch(guest, /kindle:\/\//);
  assert.match(guest, /Familienzugang/);

  const family = publicBookInternals.publicPage({ request, book, token: 'a'.repeat(24), authenticated: true });
  assert.match(family, /kindle:\/\/book\?action=open&amp;asin=B01MSS7ZYG|kindle:\/\/book\?action=open&asin=B01MSS7ZYG/);
  assert.match(family, /https:\/\/www\.amazon\.de\/dp\/B01MSS7ZYG/);
});
