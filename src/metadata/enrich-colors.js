import sharp from 'sharp';
import { coverUrl } from '../books.js';
import { databasePath } from '../config.js';
import { migrate, openDatabase } from '../database.js';
import { lightNeutralSpineColor } from '../light-spine-color.js';

export { lightNeutralSpineColor } from '../light-spine-color.js';

function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return { h: ((hue * 60) + 360) % 360, s: saturation, l: lightness };
}

function hslToRgb({ h, s, l }) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = h / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const values = section < 1 ? [chroma, x, 0]
    : section < 2 ? [x, chroma, 0]
      : section < 3 ? [0, chroma, x]
        : section < 4 ? [0, x, chroma]
          : section < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const offset = l - chroma / 2;
  return values.map((value) => Math.round((value + offset) * 255));
}

function hslToHex(hsl) {
  const [r, g, b] = hslToRgb(hsl);
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function adjustDominantColor(rgb, seed = 'cover') {
  const hsl = rgbToHsl(rgb);
  if (hsl.l >= 0.72 && hsl.s < 0.12) return lightNeutralSpineColor(seed);
  const adjusted = {
    h: hsl.h,
    s: hsl.s < 0.05 ? 0 : Math.min(0.65, Math.max(0.18, hsl.s * 0.82)),
    l: Math.min(0.42, Math.max(0.2, hsl.l * 0.82)),
  };
  return hslToHex(adjusted);
}

export async function dominantSpineColor(buffer, seed) {
  const image = sharp(buffer, { failOn: 'warning' });
  const metadata = await image.metadata();
  if ((metadata.width || 0) < 20 || (metadata.height || 0) < 20) return null;
  const stats = await image
    .resize(72, 72, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .stats();
  return adjustDominantColor(stats.dominant, seed);
}

async function fetchColor(asin, seed) {
  const response = await fetch(coverUrl(asin), {
    headers: { 'User-Agent': 'Buecherregal-MVP/0.1 (private local library)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) return { color: null, unavailable: true };
  if (!response.ok) throw new Error(`Cover HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.startsWith('image/')) {
    return { color: null, unavailable: true };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const color = await dominantSpineColor(buffer, seed);
  return { color, unavailable: color === null };
}

export async function enrichSpineColors({ path = databasePath, limit } = {}) {
  const database = openDatabase(path);
  migrate(database);
  const suffix = limit ? ' LIMIT ?' : '';
  const books = database.prepare(`
    SELECT id, asin, title FROM books
    WHERE spine_color IS NULL AND cover_analyzed_at IS NULL
      AND asin IS NOT NULL AND length(asin) = 10
    ORDER BY id${suffix}
  `).all(...(limit ? [limit] : []));
  const save = database.prepare(`
    UPDATE books SET spine_color = ?, spine_color_source = ?, cover_analyzed_at = ?, updated_at = ?
    WHERE id = ?
  `);
  let colored = 0;
  let unavailable = 0;
  let errors = 0;

  for (const [index, book] of books.entries()) {
    try {
      const result = await fetchColor(book.asin, `${book.title}:${book.id}`);
      const now = new Date().toISOString();
      save.run(result.color, result.color ? 'amazon-cover-dominant' : null, now, now, book.id);
      if (result.color) colored += 1;
      else unavailable += 1;
    } catch (error) {
      errors += 1;
      console.error(`[${index + 1}/${books.length}] ${book.title}: ${error.message}`);
    }
    if ((index + 1) % 25 === 0) console.log(`${index + 1}/${books.length}, ${colored} Farben gefunden`);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  database.exec('PRAGMA optimize');
  database.close();
  return { checked: books.length, colored, unavailable, errors };
}
