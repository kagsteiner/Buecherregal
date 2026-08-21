import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSequentialTypographyState, finalizeSequentialTypography, finalizeTypography,
  TYPOGRAPHY_SCHEMA, validateTypography,
} from '../src/metadata/enrich-typography.js';
import { FONT_KEYS } from '../src/typography/font-catalog.js';

const valid = {
  titleCandidates: ['rajdhani', 'inter', 'orbitron'],
  authorCandidates: ['inter', 'montserrat', 'rajdhani'],
  titleTextColor: '#E8E1C8',
  authorTextColor: '#ffffff',
  layoutEvidence: { authorScale: 'smaller', separateZone: false, titleDominance: 'medium' },
  titleWeight: 700,
  authorWeight: 500,
  titleCase: 'uppercase',
  authorCase: 'as-written',
  titleLetterSpacing: 0.04,
  authorLetterSpacing: 0.02,
  confidence: 0.86,
  reason: 'Technical lettering and a restrained author line.',
};

test('typography schema is constrained to the curated font catalog', () => {
  assert.deepEqual(TYPOGRAPHY_SCHEMA.properties.titleCandidates.items.enum, FONT_KEYS);
  assert.ok(FONT_KEYS.length >= 12);
});

test('typography responses are validated and normalized before persistence', () => {
  const result = validateTypography(valid);
  assert.equal(result.titleTextColor, '#e8e1c8');
  assert.equal(result.authorTextColor, '#ffffff');
  assert.equal(validateTypography({ ...valid, titleLetterSpacing: 4 }).titleLetterSpacing, 0.04);
  assert.throws(() => validateTypography({ ...valid, titleCandidates: ['invented-font', 'inter', 'orbitron'] }));
  assert.throws(() => validateTypography({ ...valid, titleCandidates: ['inter', 'inter', 'orbitron'] }));
  assert.throws(() => validateTypography({ ...valid, titleTextColor: 'cream' }));
});

test('batch finalization enforces the 80/20 layout quota and uses ranked alternatives', () => {
  const results = Array.from({ length: 25 }, (_, index) => ({
    book: { id: index + 1 },
    result: {
      ...valid,
      titleCandidates: ['bebas-neue', index % 2 ? 'literata' : 'inter', 'cinzel'],
      splitSuitability: index / 24,
    },
  }));
  const finalized = finalizeTypography(results);
  assert.equal(finalized.filter((entry) => entry.final.layout === 'split').length, 5);
  assert.ok(finalized.some((entry) => entry.final.titleFontKey !== 'bebas-neue'));
  assert.ok(finalized.slice(-5).every((entry) => entry.final.layout === 'split'));
});

test('sequential finalization preserves font diversity and an exact rolling 80/20 layout', () => {
  const state = createSequentialTypographyState();
  const results = Array.from({ length: 10 }, () => finalizeSequentialTypography({
    ...valid,
    titleCandidates: ['bebas-neue', 'literata', 'inter'],
  }, state));
  assert.equal(results.filter((result) => result.layout === 'split').length, 2);
  assert.equal(new Set(results.map((result) => result.titleFontKey)).size, 3);
});
