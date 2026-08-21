const booksElement = document.querySelector('#books');
const summaryElement = document.querySelector('#summary');
const searchElement = document.querySelector('#search');
const template = document.querySelector('#book-template');
const rows = new Map();
let books = [];
let jobs = new Map();

function escapeSelector(value) {
  return CSS.escape(String(value));
}

function updateSummary() {
  const done = [...jobs.values()].filter((job) => job.status === 'done').length;
  const pending = books.length - done;
  summaryElement.textContent = `${pending} offen${done ? ` · ${done} erledigt` : ''}`;
}

function applyJob(row, job) {
  if (!job) return;
  row.dataset.status = job.status;
  const status = row.querySelector('.status');
  const button = row.querySelector('button');
  const input = row.querySelector('input');
  status.textContent = job.status === 'done' ? `✓ ${job.message}` : job.message;
  button.disabled = ['queued', 'processing', 'done'].includes(job.status);
  input.disabled = ['queued', 'processing', 'done'].includes(job.status);
  if (job.status === 'processing') button.textContent = 'Wird verarbeitet …';
  else if (job.status === 'queued') button.textContent = 'In Warteschlange';
  else if (job.status === 'done') button.textContent = 'Erledigt';
  else button.textContent = 'Erneut versuchen';
  if (job.coverUrl) {
    const preview = row.querySelector('.cover-preview');
    preview.innerHTML = `<img src="/${job.coverUrl}" alt="" />`;
  }
}

function renderBook(book) {
  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector('.book');
  row.dataset.bookId = book.id;
  row.dataset.search = `${book.title} ${book.authors}`.toLocaleLowerCase('de-DE');
  row.querySelector('h2').textContent = book.title;
  row.querySelector('.author').textContent = book.authors;
  if (book.existingCoverUrl) {
    row.querySelector('.cover-preview').innerHTML = `<img src="/${book.existingCoverUrl}" alt="" />`;
  }
  row.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = row.querySelector('input');
    const button = row.querySelector('button');
    const status = row.querySelector('.status');
    button.disabled = true;
    input.disabled = true;
    status.textContent = 'Auftrag wird gestartet …';
    try {
      const response = await fetch(`/api/books/${book.id}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input.value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      jobs.set(book.id, body.job);
      applyJob(row, body.job);
    } catch (error) {
      status.textContent = error.message;
      row.dataset.status = 'error';
      button.disabled = false;
      input.disabled = false;
    }
  });
  booksElement.append(fragment);
  const inserted = booksElement.querySelector(`[data-book-id="${escapeSelector(book.id)}"]`);
  rows.set(book.id, inserted);
  applyJob(inserted, jobs.get(book.id));
}

function applyFilter() {
  const query = searchElement.value.trim().toLocaleLowerCase('de-DE');
  for (const row of rows.values()) row.hidden = query && !row.dataset.search.includes(query);
}

async function load() {
  const response = await fetch('/api/books');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  books = body.books;
  jobs = new Map(body.jobs.map((job) => [job.bookId, job]));
  booksElement.innerHTML = '';
  rows.clear();
  books.forEach(renderBook);
  if (!books.length) booksElement.innerHTML = '<p class="empty">Alle Bücher haben ein Cover.</p>';
  updateSummary();
}

async function poll() {
  try {
    const response = await fetch('/api/books');
    if (!response.ok) return;
    const body = await response.json();
    jobs = new Map(body.jobs.map((job) => [job.bookId, job]));
    for (const [bookId, row] of rows) applyJob(row, jobs.get(bookId));
    updateSummary();
  } finally {
    window.setTimeout(poll, 1_000);
  }
}

searchElement.addEventListener('input', applyFilter);
load().then(poll).catch((error) => {
  booksElement.innerHTML = `<p class="empty">${error.message}</p>`;
});
