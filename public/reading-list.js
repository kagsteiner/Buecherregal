const STORAGE_KEY = 'bookshelf.reading-list.v1';
const body = document.body;
const prefix = body.dataset.prefix || '';

function readList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && /^[A-Za-z0-9_-]{24}$/.test(entry.token));
  } catch {
    return [];
  }
}

function writeList(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  updateCount(entries.length);
}

function updateCount(count = readList().length) {
  document.querySelectorAll('[data-list-count]').forEach((element) => {
    element.textContent = count ? `(${count})` : '';
  });
}

function isAllowedExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['openlibrary.org', 'hardcover.app'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isLocalPath(value, kind) {
  const pattern = kind === 'cover'
    ? new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/buch\/[A-Za-z0-9_-]{24}\/cover$`)
    : new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/buch\/[A-Za-z0-9_-]{24}$`);
  return pattern.test(value);
}

function currentBook(button) {
  return {
    token: button.dataset.token,
    title: button.dataset.title || 'Unbekanntes Buch',
    authors: button.dataset.authors || 'Unbekannt',
    bookPath: button.dataset.bookPath,
    coverPath: button.dataset.coverPath,
    openLibrary: button.dataset.openLibrary,
    hardcover: button.dataset.hardcover,
    savedAt: new Date().toISOString(),
  };
}

function updateSaveButton(button, entries = readList()) {
  const saved = entries.some((entry) => entry.token === button.dataset.token);
  button.textContent = saved ? '✓ Auf meiner Leseliste' : 'Auf diesem Handy merken';
  button.classList.toggle('saved', saved);
  button.setAttribute('aria-pressed', String(saved));
}

function bindBookPage() {
  const button = document.querySelector('[data-save-book]');
  if (!button) return;
  updateSaveButton(button);
  updateCount();
  button.addEventListener('click', () => {
    const entries = readList();
    const index = entries.findIndex((entry) => entry.token === button.dataset.token);
    if (index >= 0) entries.splice(index, 1);
    else entries.unshift(currentBook(button));
    writeList(entries);
    updateSaveButton(button, entries);
    if (index < 0) document.querySelector('[data-bookmark-hint]')?.removeAttribute('hidden');
  });
}

function element(name, className, text) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function actionLink(label, url) {
  if (!isAllowedExternalUrl(url)) return null;
  const link = element('a', '', label);
  link.href = url;
  return link;
}

async function copyTitle(button, title) {
  try {
    await navigator.clipboard.writeText(title);
    const previous = button.textContent;
    button.textContent = 'Titel kopiert ✓';
    window.setTimeout(() => { button.textContent = previous; }, 1600);
  } catch {
    button.textContent = 'Kopieren nicht möglich';
  }
}

function renderList() {
  const target = document.querySelector('[data-reading-list]');
  if (!target) return;
  const entries = readList();
  target.replaceChildren();
  if (!entries.length) {
    target.append(element('p', 'empty', 'Noch kein Buch gemerkt. Scanne am Bücherregal einen QR-Code und tippe dort auf „Auf diesem Handy merken“.'));
    return;
  }
  entries.forEach((entry) => {
    const article = element('article', 'reading-item');
    if (isLocalPath(entry.coverPath, 'cover')) {
      const image = element('img');
      image.src = entry.coverPath;
      image.alt = `Cover von ${entry.title}`;
      article.append(image);
    }
    const content = element('div');
    const heading = element('h2', '', entry.title);
    if (isLocalPath(entry.bookPath, 'book')) {
      const bookLink = element('a');
      bookLink.href = entry.bookPath;
      bookLink.append(heading);
      content.append(bookLink);
    } else content.append(heading);
    content.append(element('p', 'author', entry.authors));
    const actions = element('div', 'item-actions');
    const copy = element('button', '', 'Titel kopieren');
    copy.type = 'button';
    copy.addEventListener('click', () => copyTitle(copy, entry.title));
    actions.append(copy);
    const openLibrary = actionLink('Open Library', entry.openLibrary);
    const hardcover = actionLink('Hardcover', entry.hardcover);
    if (openLibrary) actions.append(openLibrary);
    if (hardcover) actions.append(hardcover);
    const remove = element('button', 'remove', 'Entfernen');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      writeList(readList().filter((item) => item.token !== entry.token));
      renderList();
    });
    actions.append(remove);
    content.append(actions);
    article.append(content);
    target.append(article);
  });
}

if (body.dataset.page === 'book') bindBookPage();
if (body.dataset.page === 'list') renderList();
