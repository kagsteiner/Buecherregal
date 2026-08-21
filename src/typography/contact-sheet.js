import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { projectRoot } from '../config.js';
import { FONT_CATALOG } from './font-catalog.js';

const GOOGLE_FONTS_RAW = 'https://raw.githubusercontent.com/google/fonts/main';
const FONT_CACHE = join(projectRoot, 'data', 'font-cache');
let loadedFonts;

async function loadFont(font) {
  const destination = join(FONT_CACHE, `${font.key}.ttf`);
  try {
    await readFile(destination);
    return destination;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const response = await fetch(`${GOOGLE_FONTS_RAW}/${font.file}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Font ${font.family}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10_000) throw new Error(`Font ${font.family}: download is too small.`);
  await mkdir(FONT_CACHE, { recursive: true });
  await writeFile(destination, bytes);
  return destination;
}

async function getFonts() {
  loadedFonts ??= Promise.all(FONT_CATALOG.map(async (font) => {
    const path = await loadFont(font);
    if (!GlobalFonts.registerFromPath(path, font.family)) {
      throw new Error(`Font ${font.family} could not be registered.`);
    }
    return font;
  }));
  return loadedFonts;
}

function fitLine(context, text, width) {
  if (context.measureText(text).width <= width) return text;
  let shortened = text;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > width) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}…`;
}

function titleLines(context, title, width) {
  const words = title.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= width || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === 2) break;
  }
  if (current && lines.length < 2) lines.push(current);
  const consumed = lines.join(' ').split(/\s+/).length;
  if (consumed < words.length) lines[1] = fitLine(context, `${lines[1]} ${words.slice(consumed).join(' ')}`, width);
  return lines;
}

export async function renderFontContactSheet(book) {
  await getFonts();
  const canvas = createCanvas(1220, 940);
  const context = canvas.getContext('2d');
  context.fillStyle = '#eee9df';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const [index, font] of FONT_CATALOG.entries()) {
    const x = 20 + (index % 4) * 298;
    const y = 20 + Math.floor(index / 4) * 228;
    context.beginPath();
    context.roundRect(x, y, 286, 216, 12);
    context.fillStyle = '#fffdf8';
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = '#d8d1c4';
    context.stroke();

    context.fillStyle = '#5d554a';
    context.font = '17px Inter';
    context.fillText(font.key, x + 17, y + 28);

    context.fillStyle = '#17140f';
    context.font = `29px "${font.family}"`;
    const lines = titleLines(context, book.title, 252);
    lines.forEach((line, lineIndex) => context.fillText(line, x + 17, y + 83 + lineIndex * 32));

    context.fillStyle = '#625a50';
    context.font = `19px "${font.family}"`;
    context.fillText(fitLine(context, book.authors, 252), x + 17, y + 190);
  }

  const png = await canvas.encode('png');
  return `data:image/png;base64,${png.toString('base64')}`;
}
