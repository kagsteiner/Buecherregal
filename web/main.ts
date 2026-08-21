import './styles.css';

type Book = {
  id: number;
  sourceId: string;
  title: string;
  authors: string;
  pageCount: number | null;
  layoutPages: number;
  pageCountKnown: boolean;
  coverUrl: string | null;
};

const SHELF_SIZE = 10;
const AUTO_FIRST_MS = 8_000;
const AUTO_REPEAT_MS = 25_000;
const AUTO_CLOSE_MS = 11_000;
const AUTO_SHELF_MS = 10 * 60_000;

const app = document.querySelector<HTMLElement>('#app')!;
let books: Book[] = [];
let shelfSeed = Math.floor(Date.now() / 86_400_000);
let seedHistory: number[] = [];
let historyIndex = -1;
let spotlightBook: Book | null = null;
let spotlightTimer = 0;
let ambientTimer = 0;
let shelfTimer = 0;
let pointerStart: { x: number; y: number } | null = null;

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
  const hue = hash(book.sourceId) % 360;
  const saturation = 25 + (hash(`${book.sourceId}:s`) % 24);
  const lightness = 25 + (hash(`${book.sourceId}:l`) % 22);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function spineWidth(book: Book) {
  const normalized = Math.max(0, Math.min(1, (book.layoutPages - 180) / 720));
  return Math.round(34 + normalized * 46);
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
    <section class="room" aria-label="Virtuelles Bücherregal">
      <header class="masthead">
        <div>
          <p class="eyebrow">Unsere Bibliothek</p>
          <h1>Was wir gerne lesen.</h1>
        </div>
        <p class="book-count">${books.length.toLocaleString('de-DE')} Bücher</p>
      </header>

      <section class="shelf-region" aria-live="polite">
        <button class="nav nav-previous" aria-label="Vorherige Auswahl">‹</button>
        <div class="books" role="list">
          ${current.map((book) => `
            <button
              class="spine"
              role="listitem"
              aria-label="${escapeHtml(book.title)} von ${escapeHtml(book.authors)}"
              data-book-id="${book.id}"
              style="--spine-width:${spineWidth(book)}px;--spine-height:${76 + (hash(book.sourceId) % 20)}%;--spine-color:${spineColor(book)}"
            >
              <span class="spine-title">${escapeHtml(spineTitle(book.title))}</span>
              <span class="spine-author">${escapeHtml(book.authors.split(',')[0])}</span>
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
          <button class="put-back">Zurück ins Regal</button>
        </div>
      </article>
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
  const image = document.querySelector<HTMLImageElement>('.cover');
  image?.addEventListener('error', () => image.remove());
  window.requestAnimationFrame(centerSingleLineTitles);
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
  if (spotlightBook || document.hidden) return scheduleAmbient(AUTO_REPEAT_MS);
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
  if (event.key === 'Escape') closeSpotlight();
});

async function start() {
  app.innerHTML = '<p class="loading">Das Regal wird eingeräumt …</p>';
  try {
    const response = await fetch('/api/books');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    books = (await response.json()).books;
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
