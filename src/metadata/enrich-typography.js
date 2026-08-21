import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { cleanTitle, coverUrl } from '../books.js';
import { coversPath, databasePath } from '../config.js';
import { migrate, openDatabase } from '../database.js';
import { FONT_CATALOG, FONT_CATALOG_VERSION, FONT_KEYS } from '../typography/font-catalog.js';
import { renderFontContactSheet } from '../typography/contact-sheet.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:1234/v1';
const DEFAULT_MODEL = 'bookshelf-vision';
const FONT_WEIGHTS = [400, 500, 600, 700, 800, 900];
const TEXT_CASES = ['as-written', 'uppercase', 'small-caps'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const TYPOGRAPHY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'titleCandidates', 'authorCandidates', 'titleTextColor', 'authorTextColor', 'layoutEvidence',
    'titleWeight', 'authorWeight', 'titleCase', 'authorCase', 'titleLetterSpacing',
    'authorLetterSpacing', 'confidence', 'reason',
  ],
  properties: {
    titleCandidates: {
      type: 'array', minItems: 3, maxItems: 3, uniqueItems: true,
      items: { type: 'string', enum: FONT_KEYS },
    },
    authorCandidates: {
      type: 'array', minItems: 3, maxItems: 3, uniqueItems: true,
      items: { type: 'string', enum: FONT_KEYS },
    },
    titleTextColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    authorTextColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    layoutEvidence: {
      type: 'object',
      additionalProperties: false,
      required: ['authorScale', 'separateZone', 'titleDominance'],
      properties: {
        authorScale: { type: 'string', enum: ['same', 'smaller', 'much-smaller'] },
        separateZone: { type: 'boolean' },
        titleDominance: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    },
    titleWeight: { type: 'integer', enum: FONT_WEIGHTS },
    authorWeight: { type: 'integer', enum: FONT_WEIGHTS },
    titleCase: { type: 'string', enum: TEXT_CASES },
    authorCase: { type: 'string', enum: TEXT_CASES },
    titleLetterSpacing: { type: 'number', minimum: -0.04, maximum: 0.16 },
    authorLetterSpacing: { type: 'number', minimum: -0.04, maximum: 0.16 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string', maxLength: 240 },
  },
};

function promptFor(book) {
  return `You are matching a book cover to typography for a simulated physical book spine.

Known metadata:
Title: ${book.title}
Author: ${book.authors}

The first image is the cover. The second image is a contact sheet that renders this exact title and author in every allowed candidate font. Use the printed key in each card. Compare shapes, proportions, contrast, width and genre character. Return three distinct candidates for title and author, best match first. Do not repeatedly default to a condensed display font merely because the cover uses capitals.

Pick text colors from the visible cover lettering; return approximate hexadecimal RGB colors. If lettering is unclear, choose a high-contrast color from the cover palette. Return letter spacing as a decimal em value, for example 0.04 for four percent of the font size, never as a whole-number percentage.

For layoutEvidence, report only what is visibly present on the cover: whether the author lettering is the same size, smaller, or much smaller than the title; whether it occupies a clearly separate visual zone; and how strongly the title dominates. Do not decide the final spine layout. The batch process will derive a score and enforce the final 80/20 quota.

Return only the requested structured result.`;
}

export function validateTypography(value) {
  if (!value || typeof value !== 'object') throw new Error('Typography result is not an object.');
  for (const property of ['titleCandidates', 'authorCandidates']) {
    if (!Array.isArray(value[property]) || value[property].length !== 3 ||
      new Set(value[property]).size !== 3 || value[property].some((key) => !FONT_KEYS.includes(key))) {
      throw new Error(`Typography result contains invalid ${property}.`);
    }
  }
  if (!HEX_COLOR.test(value.titleTextColor) || !HEX_COLOR.test(value.authorTextColor)) {
    throw new Error('Typography result contains an invalid text color.');
  }
  const evidence = value.layoutEvidence;
  if (!evidence || !['same', 'smaller', 'much-smaller'].includes(evidence.authorScale) ||
    typeof evidence.separateZone !== 'boolean' || !['low', 'medium', 'high'].includes(evidence.titleDominance)) {
    throw new Error('Typography result contains invalid layout evidence.');
  }
  if (!FONT_WEIGHTS.includes(value.titleWeight) || !FONT_WEIGHTS.includes(value.authorWeight)) {
    throw new Error('Typography result contains an invalid font weight.');
  }
  if (!TEXT_CASES.includes(value.titleCase) || !TEXT_CASES.includes(value.authorCase)) {
    throw new Error('Typography result contains an invalid text case.');
  }
  const normalizeSpacing = (spacing) => {
    if (!Number.isFinite(spacing)) throw new Error('Typography result contains invalid letter spacing.');
    const normalized = Math.abs(spacing) > 0.16 && Math.abs(spacing) <= 16 ? spacing / 100 : spacing;
    if (normalized < -0.04 || normalized > 0.16) {
      throw new Error('Typography result contains invalid letter spacing.');
    }
    return normalized;
  };
  const confidence = value.confidence > 1 && value.confidence <= 100
    ? value.confidence / 100
    : value.confidence;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Typography result contains invalid confidence.');
  }
  return {
    ...value,
    titleTextColor: value.titleTextColor.toLowerCase(),
    authorTextColor: value.authorTextColor.toLowerCase(),
    titleLetterSpacing: normalizeSpacing(value.titleLetterSpacing),
    authorLetterSpacing: normalizeSpacing(value.authorLetterSpacing),
    confidence,
    splitSuitability: (
      { same: 0, smaller: 0.35, 'much-smaller': 0.7 }[evidence.authorScale] +
      (evidence.separateZone ? 0.7 : 0) +
      { low: 0, medium: 0.25, high: 0.5 }[evidence.titleDominance]
    ) / 1.9,
    reason: String(value.reason || '').slice(0, 240),
  };
}

async function fetchCoverDataUrl(book) {
  if (book.cover_local_path) {
    if (basename(book.cover_local_path) !== book.cover_local_path) {
      throw new Error('Unsafe local cover filename.');
    }
    const bytes = await readFile(join(coversPath, book.cover_local_path));
    if (bytes.length < 1_000) throw new Error('Local cover image is too small.');
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
  }
  const response = await fetch(coverUrl(book.asin), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Cover HTTP ${response.status}`);
  const contentType = response.headers.get('content-type');
  if (!contentType?.startsWith('image/')) throw new Error('Cover response is not an image.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1_000) throw new Error('Cover image is too small.');
  return `data:${contentType.split(';')[0]};base64,${bytes.toString('base64')}`;
}

export async function analyzeTypographyBook(book, { baseUrl, model }) {
  const displayBook = { ...book, title: cleanTitle(book.title) };
  const imageUrl = await fetchCoverDataUrl(book);
  const contactSheetUrl = await renderFontContactSheet(displayBook);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 1_600,
      reasoning_effort: 'none',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: promptFor(displayBook) },
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'image_url', image_url: { url: contactSheetUrl } },
        ],
      }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'book_spine_typography', strict: true, schema: TYPOGRAPHY_SCHEMA },
      },
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`LM Studio HTTP ${response.status}: ${detail}`);
  }
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('LM Studio returned no structured content.');
  try {
    return validateTypography(JSON.parse(content));
  } catch (error) {
    throw new Error(`Invalid structured JSON: ${error.message}; content=${JSON.stringify(content.slice(0, 300))}`);
  }
}

function assignCandidates(results, property) {
  const counts = new Map(FONT_KEYS.map((key) => [key, 0]));
  return results.map((entry) => {
    const candidates = entry.result[property];
    const selected = candidates
      .map((key, rank) => ({ key, score: counts.get(key) + rank * 1.5 }))
      .sort((left, right) => left.score - right.score || candidates.indexOf(left.key) - candidates.indexOf(right.key))[0].key;
    counts.set(selected, counts.get(selected) + 1);
    return selected;
  });
}

export function createSequentialTypographyState() {
  return {
    processed: 0,
    titleCounts: new Map(FONT_KEYS.map((key) => [key, 0])),
    authorCounts: new Map(FONT_KEYS.map((key) => [key, 0])),
  };
}

function selectSequentialCandidate(candidates, counts) {
  const selected = candidates
    .map((key, rank) => ({ key, score: counts.get(key) + rank * 1.5 }))
    .sort((left, right) => left.score - right.score || candidates.indexOf(left.key) - candidates.indexOf(right.key))[0].key;
  counts.set(selected, counts.get(selected) + 1);
  return selected;
}

export function finalizeSequentialTypography(result, state) {
  const titleFontKey = selectSequentialCandidate(result.titleCandidates, state.titleCounts);
  const authorFontKey = selectSequentialCandidate(result.authorCandidates, state.authorCounts);
  state.processed += 1;
  return {
    titleFontKey,
    authorFontKey,
    layout: state.processed % 5 === 0 ? 'split' : 'inline',
  };
}

export function finalizeTypography(results, splitShare = 0.2) {
  const titleFonts = assignCandidates(results, 'titleCandidates');
  const authorFonts = assignCandidates(results, 'authorCandidates');
  const splitCount = Math.round(results.length * splitShare);
  const splitIndexes = new Set(results
    .map((entry, index) => ({
      index,
      suitability: entry.result.splitSuitability,
      titleLength: cleanTitle(entry.book.title || '').length,
    }))
    .sort((left, right) => right.suitability - left.suitability ||
      left.titleLength - right.titleLength || left.index - right.index)
    .slice(0, splitCount)
    .map((entry) => entry.index));

  return results.map((entry, index) => ({
    ...entry,
    final: {
      titleFontKey: titleFonts[index],
      authorFontKey: authorFonts[index],
      layout: splitIndexes.has(index) ? 'split' : 'inline',
    },
  }));
}

export async function assertTypographyServer(baseUrl, model) {
  const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`LM Studio model endpoint returned HTTP ${response.status}.`);
  const models = (await response.json()).data || [];
  if (!models.some((entry) => entry.id === model)) {
    const available = models.map((entry) => entry.id).join(', ') || 'none';
    throw new Error(`Model "${model}" is not loaded. Available models: ${available}`);
  }
  const serverRoot = baseUrl.replace(/\/v1$/, '');
  const detailResponse = await fetch(`${serverRoot}/api/v1/models`, { signal: AbortSignal.timeout(5_000) });
  if (detailResponse.ok) {
    const details = (await detailResponse.json()).models || [];
    const selected = details.find((entry) => entry.key === model ||
      entry.loaded_instances?.some((instance) => instance.id === model));
    if (selected && selected.capabilities?.vision !== true) {
      throw new Error(`Model "${model}" does not support image input. Load a vision-capable model.`);
    }
  }
}

export function saveTypographyResult(database, { book, result, final, model }) {
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE books SET
      title_font_key = ?, author_font_key = ?, title_text_color = ?, author_text_color = ?,
      spine_layout = ?, title_font_weight = ?, author_font_weight = ?, title_letter_spacing = ?,
      author_letter_spacing = ?, title_case = ?, author_case = ?, typography_confidence = ?,
      typography_model = ?, typography_catalog_version = ?, typography_analysis = ?,
      typography_analyzed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    final.titleFontKey, final.authorFontKey, result.titleTextColor, result.authorTextColor,
    final.layout, result.titleWeight, result.authorWeight, result.titleLetterSpacing,
    result.authorLetterSpacing, result.titleCase, result.authorCase, result.confidence,
    model, FONT_CATALOG_VERSION, JSON.stringify({ ...result, final }), now, now, book.id,
  );
}

export async function enrichTypography({
  path = databasePath,
  limit,
  baseUrl = process.env.LM_STUDIO_BASE_URL || DEFAULT_BASE_URL,
  model = process.env.LM_STUDIO_MODEL || DEFAULT_MODEL,
  reanalyze = false,
} = {}) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  await assertTypographyServer(normalizedBaseUrl, model);
  const database = openDatabase(path);
  migrate(database);
  const suffix = limit ? ' LIMIT ?' : '';
  const analysisFilter = reanalyze ? 'IS NOT NULL' : 'IS NULL';
  const books = database.prepare(`
    SELECT id, asin, title, authors, cover_local_path FROM books
    WHERE typography_analyzed_at ${analysisFilter}
      AND ((asin IS NOT NULL AND length(asin) = 10) OR cover_local_path IS NOT NULL)
    ORDER BY id${suffix}
  `).all(...(limit ? [limit] : []));
  const save = database.prepare(`
    UPDATE books SET
      title_font_key = ?, author_font_key = ?, title_text_color = ?, author_text_color = ?,
      spine_layout = ?, title_font_weight = ?, author_font_weight = ?, title_letter_spacing = ?,
      author_letter_spacing = ?, title_case = ?, author_case = ?, typography_confidence = ?,
      typography_model = ?, typography_catalog_version = ?, typography_analysis = ?,
      typography_analyzed_at = ?, updated_at = ?
    WHERE id = ?
  `);
  const results = [];
  let errors = 0;

  for (const [index, book] of books.entries()) {
    try {
      const result = await analyzeTypographyBook(book, { baseUrl: normalizedBaseUrl, model });
      results.push({ book, result });
    } catch (error) {
      errors += 1;
      console.error(`[${index + 1}/${books.length}] ${book.title}: ${error.message}`);
    }
    console.log(`${index + 1}/${books.length}, ${results.length} typografisch analysiert`);
  }

  const finalized = finalizeTypography(results);
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const entry of finalized) {
      const { book, result, final } = entry;
      const now = new Date().toISOString();
      save.run(
        final.titleFontKey, final.authorFontKey, result.titleTextColor, result.authorTextColor,
        final.layout, result.titleWeight, result.authorWeight, result.titleLetterSpacing,
        result.authorLetterSpacing, result.titleCase, result.authorCase, result.confidence,
        model, FONT_CATALOG_VERSION, JSON.stringify({ ...result, final }), now, now, book.id,
      );
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  database.exec('PRAGMA optimize');
  database.close();
  return { checked: books.length, analyzed: finalized.length, errors, model, catalogVersion: FONT_CATALOG_VERSION };
}
