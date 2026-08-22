import '@fontsource-variable/literata';
import '@fontsource-variable/libre-baskerville';
import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/bodoni-moda';
import '@fontsource-variable/cinzel';
import '@fontsource-variable/roboto-slab';
import '@fontsource-variable/inter';
import '@fontsource-variable/montserrat';
import '@fontsource/barlow-condensed/latin-400.css';
import '@fontsource/barlow-condensed/latin-ext-400.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-ext-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-ext-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-ext-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-ext-800.css';
import '@fontsource/barlow-condensed/latin-900.css';
import '@fontsource/barlow-condensed/latin-ext-900.css';
import '@fontsource-variable/oswald';
import '@fontsource/bebas-neue/latin.css';
import '@fontsource/bebas-neue/latin-ext.css';
import '@fontsource/archivo-black/latin.css';
import '@fontsource/archivo-black/latin-ext.css';
import '@fontsource/rajdhani/latin-400.css';
import '@fontsource/rajdhani/latin-ext-400.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-ext-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-ext-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/rajdhani/latin-ext-700.css';
import '@fontsource-variable/orbitron';
import '@fontsource/special-elite/latin.css';
import '@fontsource/special-elite/latin-ext.css';
import '@fontsource-variable/caveat';
import { ensureTextContrast } from '../src/color-contrast.js';
import { lightNeutralSpineColor } from '../src/light-spine-color.js';
import './styles.css';

type Book = {
  id: number;
  sourceId: string;
  title: string;
  authors: string;
  pageCount: number | null;
  layoutPages: number;
  pageCountKnown: boolean;
  spineColor: string | null;
  titleFontKey: string | null;
  authorFontKey: string | null;
  titleTextColor: string | null;
  authorTextColor: string | null;
  spineLayout: 'inline' | 'split' | null;
  titleFontWeight: number | null;
  authorFontWeight: number | null;
  titleLetterSpacing: number | null;
  authorLetterSpacing: number | null;
  titleCase: 'as-written' | 'uppercase' | 'small-caps' | null;
  authorCase: 'as-written' | 'uppercase' | 'small-caps' | null;
  typographyConfidence: number | null;
  hiddenAt?: string | null;
  coverUrl: string | null;
};

type ShelfPresentation = {
  eyebrow: string;
  title: string;
  showHeading: boolean;
};

const SHELF_SIZE = 10;
const AUTO_FIRST_MS = 8_000;
const AUTO_REPEAT_MS = 25_000;
const AUTO_CLOSE_MS = 11_000;
const AUTO_SHELF_MS = 10 * 60_000;
const shelfPresentation: ShelfPresentation = {
  eyebrow: 'Unsere Bibliothek',
  title: 'Was wir gerne lesen.',
  showHeading: false,
};

const FONT_FAMILIES: Record<string, string> = {
  'literata': 'Literata Variable, Georgia, serif',
  'libre-baskerville': 'Libre Baskerville Variable, Georgia, serif',
  'cormorant-garamond': 'Cormorant Garamond Variable, Georgia, serif',
  'bodoni-moda': 'Bodoni Moda Variable, Didot, Georgia, serif',
  'cinzel': 'Cinzel Variable, Georgia, serif',
  'roboto-slab': 'Roboto Slab Variable, Rockwell, Georgia, serif',
  'inter': 'Inter Variable, Inter, system-ui, sans-serif',
  'montserrat': 'Montserrat Variable, system-ui, sans-serif',
  'barlow-condensed': 'Barlow Condensed, Arial Narrow, sans-serif',
  'oswald': 'Oswald Variable, Arial Narrow, sans-serif',
  'bebas-neue': 'Bebas Neue, Arial Narrow, sans-serif',
  'archivo-black': 'Archivo Black, Arial Black, sans-serif',
  'rajdhani': 'Rajdhani, system-ui, sans-serif',
  'orbitron': 'Orbitron Variable, system-ui, sans-serif',
  'special-elite': 'Special Elite, Courier New, monospace',
  'caveat': 'Caveat Variable, cursive',
};

const app = document.querySelector<HTMLElement>('#app')!;
let books: Book[] = [];
let shelfSeed = Math.floor(Date.now() / 86_400_000);
let seedHistory: number[] = [];
let historyIndex = -1;
let spotlightBook: Book | null = null;
let spotlightTimer = 0;
let ambientTimer = 0;
let shelfTimer = 0;
let hideLongPressTimer = 0;
let hideLongPressTriggered = false;
let hiddenBooks: Book[] | null = null;
let pointerStart: { x: number; y: number } | null = null;

function appUrl(path: string) {
  const base = new URL('.', window.location.href);
  return new URL(path.replace(/^\/+/, ''), base).toString();
}

function hash(input: string | number) {
  let value = 2166136261;
  for (const character of String(input)) {
    value ^= character.codePointAt(0)!;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function selection(seed: number) {
  const random = seededRandom(seed);
  return [...books]
    .map((book) => ({ book, sort: random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, Math.min(SHELF_SIZE, books.length))
    .map(({ book }) => book);
}

function escapeHtml(value: string) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

function spineColor(book: Book) {
  if (book.spineColor === '#6b6b6b') return lightNeutralSpineColor(`${book.title}:${book.sourceId}`);
  if (book.spineColor) return book.spineColor;
  const hue = hash(book.sourceId) % 360;
  const saturation = 25 + (hash(`${book.sourceId}:s`) % 24);
  const lightness = 25 + (hash(`${book.sourceId}:l`) % 22);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function spineWidth(book: Book) {
  const normalized = Math.max(0, Math.min(1, (book.layoutPages - 180) / 720));
  return Math.round(42 + normalized * 56);
}

function validColor(color: string | null, fallback: string) {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function validWeight(weight: number | null, fallback: number) {
  return weight && weight >= 400 && weight <= 900 ? weight : fallback;
}

function validSpacing(spacing: number | null, fallback: number) {
  return Number.isFinite(spacing) ? Math.max(-0.04, Math.min(0.16, spacing!)) : fallback;
}

function typographyStyle(book: Book) {
  const titleFont = FONT_FAMILIES[book.titleFontKey || ''] || 'Iowan Old Style, Baskerville, Georgia, serif';
  const authorFont = FONT_FAMILIES[book.authorFontKey || ''] || 'Inter, system-ui, sans-serif';
  const background = spineColor(book);
  const titleContrast = ensureTextContrast(validColor(book.titleTextColor, '#fff9ed'), background);
  const authorContrast = ensureTextContrast(validColor(book.authorTextColor, '#f3eee6'), background);
  return [
    `--title-font:${titleFont}`,
    `--author-font:${authorFont}`,
    `--title-color:${titleContrast.color}`,
    `--author-color:${authorContrast.color}`,
    `--title-shadow:${titleContrast.shadow}`,
    `--author-shadow:${authorContrast.shadow}`,
    `--title-weight:${validWeight(book.titleFontWeight, 400)}`,
    `--author-weight:${validWeight(book.authorFontWeight, 500)}`,
    `--title-spacing:${validSpacing(book.titleLetterSpacing, 0)}em`,
    `--author-spacing:${validSpacing(book.authorLetterSpacing, 0.09)}em`,
  ].join(';');
}

function caseClass(prefix: 'title' | 'author', value: Book['titleCase']) {
  return `${prefix}-case-${value || 'as-written'}`;
}

function spineTitle(title: string) {
  const withoutEdition = title
    .replace(/\s*\([^)]*(edition|ausgabe|kindle|book\s*\d+|english|deutsch)[^)]*\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const mainTitle = withoutEdition.includes(':') && withoutEdition.split(':')[0].length >= 10
    ? withoutEdition.split(':')[0].trim()
    : withoutEdition;
  if (mainTitle.length <= 54) return mainTitle;
  const shortened = mainTitle.slice(0, 51).replace(/\s+\S*$/, '').trim();
  return `${shortened || mainTitle.slice(0, 51)}…`;
}

function render() {
  const current = selection(shelfSeed);
  app.innerHTML = `
    <section class="room${shelfPresentation.showHeading ? '' : ' room--ambient'}" aria-label="Virtuelles Bücherregal">
      <header class="masthead"${shelfPresentation.showHeading ? '' : ' hidden'}>
        <div>
          <p class="eyebrow">${escapeHtml(shelfPresentation.eyebrow)}</p>
          <h1>${escapeHtml(shelfPresentation.title)}</h1>
        </div>
        <p class="book-count">${books.length.toLocaleString('de-DE')} Bücher</p>
      </header>

      <section class="shelf-region" aria-live="polite">
        <button class="nav nav-previous" aria-label="Vorherige Auswahl">‹</button>
        <div class="books" role="list">
          ${current.map((book) => `
            <button
              class="spine spine--${book.spineLayout || 'split'}"
              role="listitem"
              aria-label="${escapeHtml(book.title)} von ${escapeHtml(book.authors)}"
              data-book-id="${book.id}"
              style="--spine-width:${spineWidth(book)}px;--spine-height:${76 + (hash(book.sourceId) % 20)}%;--spine-color:${spineColor(book)};${typographyStyle(book)}"
            >
              <span class="spine-title ${caseClass('title', book.titleCase)}">${escapeHtml(spineTitle(book.title))}</span>
              <span class="spine-author ${caseClass('author', book.authorCase)}">${escapeHtml(book.authors.split(',')[0])}</span>
            </button>
          `).join('')}
        </div>
        <button class="nav nav-next" aria-label="Neue Auswahl">›</button>
        <div class="shelf-board"></div>
      </section>

      <footer>
        <span>‹ zurück</span>
        <span class="swipe-hint">Wischen zum Stöbern</span>
        <span>neu ›</span>
      </footer>
    </section>
    ${spotlightBook ? spotlightMarkup(spotlightBook) : ''}
    ${hiddenBooks ? hiddenManagerMarkup(hiddenBooks) : ''}
  `;
  bindEvents();
}

function spotlightMarkup(book: Book) {
  const pages = book.pageCountKnown ? `${book.pageCount} Seiten` : 'Seitenzahl noch unbekannt';
  return `
    <div class="spotlight" role="dialog" aria-modal="true" aria-label="Buch im Fokus">
      <button class="spotlight-backdrop" aria-label="Buch zurückstellen"></button>
      <article class="book-focus">
        <div class="cover-wrap">
          ${book.coverUrl ? `<img class="cover" src="${book.coverUrl}" alt="Cover von ${escapeHtml(book.title)}" />` : ''}
          <div class="cover-fallback" style="--cover-color:${spineColor(book)}">
            <strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.authors)}</span>
          </div>
        </div>
        <div class="book-details">
          <p class="eyebrow">Aus dem Regal</p>
          <h2>${escapeHtml(book.title)}</h2>
          <p class="focus-author">${escapeHtml(book.authors)}</p>
          <p class="focus-pages">${pages}</p>
          <div class="focus-actions">
            <button class="put-back">Zurück ins Regal</button>
            <button class="hide-book" title="Kurz drücken: Buch ausblenden. Gedrückt halten: ausgeblendete Bücher verwalten.">Ausblenden</button>
          </div>
          <p class="hide-hint">„Ausblenden“ gedrückt halten, um Bücher wieder einzublenden.</p>
        </div>
      </article>
    </div>
  `;
}

function hiddenManagerMarkup(hidden: Book[]) {
  return `
    <div class="hidden-manager" role="dialog" aria-modal="true" aria-labelledby="hidden-title">
      <button class="hidden-backdrop" type="button" aria-label="Zurück zum Regal"></button>
      <section class="hidden-panel">
        <p class="eyebrow">Regal verwalten</p>
        <h2 id="hidden-title">Ausgeblendete Bücher</h2>
        ${hidden.length ? `
          <form class="hidden-form">
            <div class="hidden-list">
              ${hidden.map((book) => `
                <label class="hidden-book-row">
                  <input type="checkbox" name="hidden-book" value="${book.id}" />
                  <span><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.authors)}</small></span>
                </label>
              `).join('')}
            </div>
            <div class="hidden-actions">
              <button class="hidden-close" type="button">Abbrechen</button>
              <button class="unhide-selected" type="submit" disabled>Wieder einblenden</button>
            </div>
          </form>
        ` : `
          <p class="hidden-empty">Zurzeit sind keine Bücher ausgeblendet.</p>
          <button class="hidden-close" type="button">Zurück zum Regal</button>
        `}
      </section>
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll<HTMLElement>('[data-book-id]').forEach((element) => {
    element.addEventListener('click', () => showSpotlight(Number(element.dataset.bookId)));
  });
  document.querySelector('.nav-next')?.addEventListener('click', nextShelf);
  document.querySelector('.nav-previous')?.addEventListener('click', previousShelf);
  document.querySelectorAll('.spotlight-backdrop, .put-back').forEach((element) => {
    element.addEventListener('click', closeSpotlight);
  });
  bindHideButton();
  document.querySelectorAll('.hidden-backdrop, .hidden-close').forEach((element) => {
    element.addEventListener('click', closeHiddenManager);
  });
  const hiddenForm = document.querySelector<HTMLFormElement>('.hidden-form');
  hiddenForm?.addEventListener('change', updateUnhideButton);
  hiddenForm?.addEventListener('submit', unhideSelectedBooks);
  const image = document.querySelector<HTMLImageElement>('.cover');
  image?.addEventListener('error', () => image.remove());
  window.requestAnimationFrame(centerSingleLineTitles);
}

function bindHideButton() {
  const button = document.querySelector<HTMLButtonElement>('.hide-book');
  if (!button) return;
  const cancelLongPress = () => window.clearTimeout(hideLongPressTimer);
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    hideLongPressTriggered = false;
    cancelLongPress();
    hideLongPressTimer = window.setTimeout(() => {
      hideLongPressTriggered = true;
      void openHiddenManager();
    }, 700);
  });
  button.addEventListener('pointerup', cancelLongPress);
  button.addEventListener('pointercancel', cancelLongPress);
  button.addEventListener('pointerleave', cancelLongPress);
  button.addEventListener('click', (event) => {
    if (hideLongPressTriggered) {
      event.preventDefault();
      hideLongPressTriggered = false;
      return;
    }
    void hideCurrentBook();
  });
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    cancelLongPress();
    void openHiddenManager();
  });
}

function centerSingleLineTitles() {
  document.querySelectorAll<HTMLElement>('.spine-title').forEach((title) => {
    const range = document.createRange();
    range.selectNodeContents(title);
    if (range.getClientRects().length <= 1) title.classList.add('is-single-line');
  });
}

function showSpotlight(id: number) {
  spotlightBook = books.find((book) => book.id === id) || null;
  window.clearTimeout(spotlightTimer);
  render();
  spotlightTimer = window.setTimeout(closeSpotlight, AUTO_CLOSE_MS);
  scheduleAmbient(AUTO_REPEAT_MS);
}

function closeSpotlight() {
  if (!spotlightBook) return;
  spotlightBook = null;
  window.clearTimeout(spotlightTimer);
  render();
}

async function loadVisibleBooks() {
  const response = await fetch(appUrl('api/books'));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  books = (await response.json()).books;
}

async function hideCurrentBook() {
  if (!spotlightBook) return;
  const id = spotlightBook.id;
  window.clearTimeout(spotlightTimer);
  const response = await fetch(appUrl(`api/books/${id}/hide`), { method: 'POST' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await loadVisibleBooks();
  spotlightBook = null;
  render();
  scheduleAmbient(AUTO_REPEAT_MS);
}

async function openHiddenManager() {
  window.clearTimeout(spotlightTimer);
  const response = await fetch(appUrl('api/books/hidden'));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  hiddenBooks = (await response.json()).books;
  spotlightBook = null;
  render();
}

function closeHiddenManager() {
  if (!hiddenBooks) return;
  hiddenBooks = null;
  render();
  scheduleAmbient(AUTO_REPEAT_MS);
}

function updateUnhideButton() {
  const selected = document.querySelectorAll<HTMLInputElement>('[name="hidden-book"]:checked');
  const button = document.querySelector<HTMLButtonElement>('.unhide-selected');
  if (button) button.disabled = selected.length === 0;
}

async function unhideSelectedBooks(event: SubmitEvent) {
  event.preventDefault();
  const ids = [...document.querySelectorAll<HTMLInputElement>('[name="hidden-book"]:checked')]
    .map((checkbox) => Number(checkbox.value));
  if (ids.length === 0) return;
  const response = await fetch(appUrl('api/books/unhide'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await loadVisibleBooks();
  hiddenBooks = null;
  render();
  scheduleAmbient(AUTO_REPEAT_MS);
}

function nextShelf() {
  if (historyIndex < seedHistory.length - 1) {
    historyIndex += 1;
    shelfSeed = seedHistory[historyIndex];
  } else {
    shelfSeed = hash(`${shelfSeed}:${Date.now()}`);
    seedHistory = [...seedHistory.slice(0, historyIndex + 1), shelfSeed];
    historyIndex += 1;
  }
  spotlightBook = null;
  render();
  scheduleAmbient(AUTO_REPEAT_MS);
  scheduleShelfRotation();
}

function previousShelf() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  shelfSeed = seedHistory[historyIndex];
  spotlightBook = null;
  render();
  scheduleAmbient(AUTO_REPEAT_MS);
  scheduleShelfRotation();
}

function ambientSpotlight() {
  if (spotlightBook || hiddenBooks || document.hidden) return scheduleAmbient(AUTO_REPEAT_MS);
  const current = selection(shelfSeed);
  const book = current[Math.floor(Math.random() * current.length)];
  if (book) showSpotlight(book.id);
}

function scheduleAmbient(delay: number) {
  window.clearTimeout(ambientTimer);
  ambientTimer = window.setTimeout(ambientSpotlight, delay);
}

function scheduleShelfRotation() {
  window.clearTimeout(shelfTimer);
  shelfTimer = window.setTimeout(nextShelf, AUTO_SHELF_MS);
}

document.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY };
});
document.addEventListener('pointerup', (event) => {
  if (!pointerStart || spotlightBook) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
  if (dx < 0) nextShelf();
  else previousShelf();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') previousShelf();
  if (event.key === 'ArrowRight') nextShelf();
  if (event.key === 'Escape') hiddenBooks ? closeHiddenManager() : closeSpotlight();
});

async function start() {
  app.innerHTML = '<p class="loading">Das Regal wird eingeräumt …</p>';
  try {
    await loadVisibleBooks();
    seedHistory = [shelfSeed];
    historyIndex = 0;
    render();
    scheduleAmbient(AUTO_FIRST_MS);
    scheduleShelfRotation();
  } catch (error) {
    app.innerHTML = '<p class="loading">Die Bibliothek konnte nicht geladen werden.</p>';
    console.error(error);
  }
}

start();
