import { openDatabase, migrate } from './database.js';

export function deterministicPageCount(id) {
  let hash = 2166136261;
  for (const character of String(id)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 300 + ((hash >>> 0) % 301);
}

const titleMarketingPatterns = [
  /\bbestsell(?:er|ing)\b/i,
  /\b(?:spiegel|sunday times|new york times|internationally|globally|worldwide)[- ]?bestseller\b/i,
  /\b(?:winner|winning|award[- ]winning|award|ausgezeichnet|preisträger|nobelpreis)\b/i,
  /\b(?:phenomenon|sensation|must[- ]read)\b/i,
  /\b(?:from|by) the (?:internationally |globally |sunday times |new york times )?(?:bestselling )?author\b/i,
  /\bvom autor (?:von|des|der)\b/i,
  /\b(?:now (?:on|a|an|the)|inspired the|behind the).*(?:series|show|film|tv|bbc|hbo|netflix|prime|apple tv)\b/i,
  /\b(?:verfilmung|verfilmt|tv-serie|fernsehserie)\b/i,
  /^(?:the |an? )?(?:absolutely |emotionally |utterly |darkly |wickedly )?(?:gripping|thrilling|chilling|compulsive|unputdownable|uplifting|redemptive|spellbinding|spectacular|high-stakes|heartwarming|jaw-dropping)\b/i,
  /^(?:enter|discover|perfect for|for fans of)\b/i,
  /^(?:the )?(?:epic fantasy|epic space opera|science fiction adventure)\b.*\b(?:from|master|fans)\b/i,
  /^(?:der|die|das|ein|eine)\s+(?:große|großartige|packende|spannende|spektakuläre|ultimative)\b/i,
  /[»“”„][^»“”„]{8,}[»“”„]/,
  /^['"][^'"]{8,}['"]?/,
];

function removeTitleParentheses(value) {
  let result = value;
  let previous;
  do {
    previous = result;
    result = result.replace(/(^|\s+)\([^()]*\)\s*/g, '$1');
  } while (result !== previous);
  return result;
}

function titleContainsMarketing(value) {
  return titleMarketingPatterns.some((pattern) => pattern.test(value));
}

function removeTitleMarketing(value) {
  let title = removeTitleParentheses(value);
  const pipe = title.search(/\s*[|｜]\s*/);
  if (pipe >= 0) title = title.slice(0, pipe);

  for (const match of title.matchAll(/:/g)) {
    const suffix = title.slice(match.index + 1).trim().split(/\s[-–—]\s/, 1)[0];
    if (titleContainsMarketing(suffix)) {
      title = title.slice(0, match.index);
      break;
    }
  }

  for (const match of title.matchAll(/\s[-–—]\s/g)) {
    const suffix = title.slice(match.index + 3).trim();
    if (titleContainsMarketing(suffix)) {
      title = title.slice(0, match.index);
      break;
    }
  }

  return title
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/(?:\s*[-–—|]\s*)+$/g, '')
    .trim();
}

export function cleanTitle(title) {
  const normalized = title
    .replace(/_for_Kindle$/i, '')
    .replaceAll('_', ' ')
    .replace(/\s*\(English Edition\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return removeTitleMarketing(normalized) || normalized;
}

export function coverUrl(asin) {
  if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) return null;
  return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
}

export function localCoverUrl(path) {
  if (!path || !/^[a-zA-Z0-9._-]+$/.test(path)) return null;
  return `covers/${encodeURIComponent(path)}`;
}

function listBooksWhere(databasePath, predicate) {
  const database = openDatabase(databasePath);
  migrate(database);
  const rows = database.prepare(`
    SELECT id, source_id, asin, title, authors, page_count, page_count_source,
      spine_color, hidden_at, title_font_key, author_font_key, title_text_color,
      author_text_color, spine_layout, title_font_weight, author_font_weight,
      title_letter_spacing, author_letter_spacing, title_case, author_case,
      typography_confidence, cover_local_path, cover_source, cover_match_confidence,
      hardcover_book_id, hardcover_slug, hardcover_description, hardcover_genres,
      hardcover_moods, hardcover_tags, hardcover_rating, hardcover_ratings_count,
      hardcover_ratings_distribution, hardcover_match_confidence
    FROM books
    WHERE title <> '' AND ${predicate}
    ORDER BY title COLLATE NOCASE
  `).all();
  database.close();

  return rows.map((book) => {
    const fallbackPages = deterministicPageCount(book.source_id);
    return {
      id: book.id,
      sourceId: book.source_id,
      title: cleanTitle(book.title),
      authors: book.authors || 'Unbekannt',
      asin: book.asin,
      pageCount: book.page_count,
      layoutPages: book.page_count || fallbackPages,
      pageCountKnown: book.page_count !== null,
      pageCountSource: book.page_count_source,
      spineColor: book.spine_color,
      titleFontKey: book.title_font_key,
      authorFontKey: book.author_font_key,
      titleTextColor: book.title_text_color,
      authorTextColor: book.author_text_color,
      spineLayout: book.spine_layout,
      titleFontWeight: book.title_font_weight,
      authorFontWeight: book.author_font_weight,
      titleLetterSpacing: book.title_letter_spacing,
      authorLetterSpacing: book.author_letter_spacing,
      titleCase: book.title_case,
      authorCase: book.author_case,
      typographyConfidence: book.typography_confidence,
      coverSource: book.cover_source,
      coverMatchConfidence: book.cover_match_confidence,
      hiddenAt: book.hidden_at,
      coverUrl: localCoverUrl(book.cover_local_path) || coverUrl(book.asin),
      hardcoverBookId: book.hardcover_book_id,
      hardcoverSlug: book.hardcover_slug,
      description: book.hardcover_description,
      genres: parseJsonArray(book.hardcover_genres),
      moods: parseJsonArray(book.hardcover_moods),
      tags: parseJsonArray(book.hardcover_tags),
      rating: book.hardcover_rating,
      ratingsCount: book.hardcover_ratings_count,
      ratingsDistribution: parseRatingDistribution(book.hardcover_ratings_distribution),
      hardcoverMatchConfidence: book.hardcover_match_confidence,
    };
  });
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function parseRatingDistribution(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry) => Number.isFinite(entry?.rating) && Number.isFinite(entry?.count))
      : [];
  } catch {
    return [];
  }
}

export function listBooks(databasePath) {
  return listBooksWhere(databasePath, 'is_hidden = 0');
}

export function listHiddenBooks(databasePath) {
  return listBooksWhere(databasePath, 'is_hidden = 1');
}

export function hideBook(id, databasePath) {
  const database = openDatabase(databasePath);
  migrate(database);
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE books SET is_hidden = 1, hidden_at = ?, updated_at = ?
    WHERE id = ? AND is_hidden = 0
  `).run(now, now, id);
  database.close();
  return Number(result.changes);
}

export function unhideBooks(ids, databasePath) {
  if (ids.length === 0) return 0;
  const database = openDatabase(databasePath);
  migrate(database);
  const placeholders = ids.map(() => '?').join(', ');
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE books SET is_hidden = 0, hidden_at = NULL, updated_at = ?
    WHERE is_hidden = 1 AND id IN (${placeholders})
  `).run(now, ...ids);
  database.close();
  return Number(result.changes);
}
