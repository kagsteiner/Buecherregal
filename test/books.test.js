import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanTitle, coverUrl, deterministicPageCount } from '../src/books.js';
import { choosePageCount } from '../src/metadata/enrich-pages.js';
import { adjustDominantColor, lightNeutralSpineColor } from '../src/metadata/enrich-colors.js';
import { contrastRatio, ensureTextContrast } from '../src/color-contrast.js';

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

test('display titles remove metadata and marketing without dropping real subtitles', () => {
  assert.equal(
    cleanTitle('A Game of Thrones: The bestselling classic epic fantasy series behind the award-winning HBO show (A Song Of Ice And Fire Book 1)'),
    'A Game of Thrones',
  );
  assert.equal(
    cleanTitle('A Crack in Creation: The New Power to Control Evolution'),
    'A Crack in Creation: The New Power to Control Evolution',
  );
  assert.equal(
    cleanTitle('A Higher Loyalty: Truth, Lies, and Leadership'),
    'A Higher Loyalty: Truth, Lies, and Leadership',
  );
  assert.equal(
    cleanTitle('Why We Believe in God(s): A Concise Guide to the Science of Faith (English Edition)'),
    'Why We Believe in God(s): A Concise Guide to the Science of Faith',
  );
  assert.equal(
    cleanTitle('Das Rätsel: Ein Roman | SPIEGEL-Bestseller und Pressestimmen'),
    'Das Rätsel: Ein Roman',
  );
  assert.equal(
    cleanTitle('Moralspektakel: Wie die richtige Haltung zum Statussymbol wurde - AUSGEZEICHNET MIT DEM TRACTATUS-PREIS'),
    'Moralspektakel: Wie die richtige Haltung zum Statussymbol wurde',
  );
});

test('cover URLs are only generated for plausible ASINs', () => {
  assert.match(coverUrl('B004TGTW3W'), /B004TGTW3W/);
  assert.equal(coverUrl('not-an-asin'), null);
});

test('dominant cover colors are darkened and desaturated to a valid spine color', () => {
  assert.match(adjustDominantColor({ r: 255, g: 0, b: 0 }), /^#[0-9a-f]{6}$/);
});

test('white covers become stable, varied light spine colors', () => {
  const first = adjustDominantColor({ r: 255, g: 255, b: 255 }, 'First book');
  assert.equal(first, adjustDominantColor({ r: 255, g: 255, b: 255 }, 'First book'));
  assert.notEqual(first, adjustDominantColor({ r: 255, g: 255, b: 255 }, 'Second book'));
  assert.equal(first, lightNeutralSpineColor('First book'));
  assert.match(first, /^#[0-9a-f]{6}$/);
});

test('low-contrast spine lettering is minimally corrected to an accessible contrast', () => {
  const corrected = ensureTextContrast('#777777', '#777777');
  assert.equal(corrected.adjusted, true);
  assert.ok(contrastRatio(corrected.color, '#777777') >= 4.5);
  assert.notEqual(corrected.shadow, 'transparent');
});

test('already legible cover typography keeps its original color', () => {
  assert.deepEqual(ensureTextContrast('#ffffff', '#151515'), {
    color: '#ffffff', adjusted: false, shadow: 'transparent',
  });
});
