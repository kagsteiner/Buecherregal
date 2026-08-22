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

test('public pages offer the device list before Open Library and Hardcover', () => {
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
  const page = publicBookInternals.publicPage({ request, book, token: 'a'.repeat(24) });
  assert.ok(page.indexOf('Auf diesem Handy merken') < page.indexOf('Bei Open Library ansehen'));
  assert.ok(page.indexOf('Bei Open Library ansehen') < page.indexOf('Bei Hardcover ansehen'));
  assert.match(page, /href="\/buecherregal\/merkliste"/);
  assert.match(page, /src="\/buecherregal\/reading-list\.js"/);
  assert.doesNotMatch(page, /kindle:\/\/|amazon\.de|Familienzugang/);
});

test('reading list page explains browser-local persistence and home-screen access', () => {
  const request = {
    headers: { 'x-forwarded-prefix': '/buecherregal' },
    socket: {},
  };
  const page = publicBookInternals.readingListPage(request);
  assert.match(page, /Meine Leseliste/);
  assert.match(page, /Zum Home-Bildschirm/);
  assert.match(page, /ausschließlich in diesem Browser gespeichert/);
  assert.match(page, /href="\/buecherregal\/manifest\.webmanifest"/);
});
