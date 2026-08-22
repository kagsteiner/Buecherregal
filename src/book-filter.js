export const EMPTY_BOOK_FILTER = Object.freeze({
  title: '',
  author: '',
  description: '',
  genres: Object.freeze([]),
  moods: Object.freeze([]),
  minimumRating: null,
});

export function normalizeFilterText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('de-DE');
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

function cleanFacets(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(cleanText)
    .filter((entry) => {
      const normalized = normalizeFilterText(entry);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 30);
}

function displayLabelQuality(label) {
  return label === label.toLocaleLowerCase('de-DE') ? 0 : 1;
}

export function sanitizeBookFilter(value) {
  const filter = value && typeof value === 'object' ? value : {};
  const rating = Number(filter.minimumRating);
  return {
    title: cleanText(filter.title),
    author: cleanText(filter.author),
    description: cleanText(filter.description),
    genres: cleanFacets(filter.genres),
    moods: cleanFacets(filter.moods),
    minimumRating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
  };
}

export function hasActiveBookFilter(value) {
  const filter = sanitizeBookFilter(value);
  return Boolean(
    filter.title
    || filter.author
    || filter.description
    || filter.genres.length
    || filter.moods.length
    || filter.minimumRating !== null
  );
}

function includesText(value, query) {
  return !query || normalizeFilterText(value).includes(query);
}

function matchesFacet(bookValues, selectedValues) {
  if (selectedValues.length === 0) return true;
  const available = new Set((bookValues || []).map(normalizeFilterText));
  return selectedValues.some((value) => available.has(normalizeFilterText(value)));
}

export function filterBooks(books, value) {
  const filter = sanitizeBookFilter(value);
  const title = normalizeFilterText(filter.title);
  const author = normalizeFilterText(filter.author);
  const description = normalizeFilterText(filter.description);
  return books.filter((book) => (
    includesText(book.title, title)
    && includesText(book.authors, author)
    && includesText(book.description, description)
    && matchesFacet(book.genres, filter.genres)
    && matchesFacet(book.moods, filter.moods)
    && (filter.minimumRating === null
      || (Number.isFinite(book.rating) && book.rating >= filter.minimumRating))
  ));
}

export function collectFacetOptions(books, property) {
  const groups = new Map();
  for (const book of books) {
    const seenForBook = new Set();
    for (const rawLabel of book[property] || []) {
      const label = cleanText(rawLabel);
      const normalized = normalizeFilterText(label);
      if (!normalized || !/\p{L}/u.test(label) || seenForBook.has(normalized)) continue;
      seenForBook.add(normalized);
      const group = groups.get(normalized) || { normalized, count: 0, variants: new Map() };
      group.count += 1;
      group.variants.set(label, (group.variants.get(label) || 0) + 1);
      groups.set(normalized, group);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      value: [...group.variants].sort((left, right) => (
        right[1] - left[1]
        || displayLabelQuality(right[0]) - displayLabelQuality(left[0])
        || left[0].localeCompare(right[0], 'de')
      ))[0][0],
      normalized: group.normalized,
      count: group.count,
    }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, 'de'));
}
