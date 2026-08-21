import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { kindleDatabasePath } from '../config.js';
import { readArchivedObjects } from './bplist.js';

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function namedValues(value, key) {
  return asArray(value)
    .flatMap((item) => (typeof item === 'string' ? [item] : asArray(item?.[key])))
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());
}

function normalizeMetadata(object) {
  const attributes = object?.attributes ?? object;
  if (!attributes || typeof attributes !== 'object') return undefined;

  const asin = typeof attributes.ASIN === 'string' ? attributes.ASIN : undefined;
  const title = typeof attributes.title === 'string' ? attributes.title : undefined;
  if (!asin && !title) return undefined;

  return {
    asin,
    title,
    authors: namedValues(attributes.authors, 'author'),
    publishers: namedValues(attributes.publishers, 'publisher'),
    publicationDate:
      typeof attributes.publication_date === 'string' ? attributes.publication_date : undefined,
    contentType: typeof attributes.content_type === 'string' ? attributes.content_type : undefined,
  };
}

function metadataIndex(paths) {
  const byAsin = new Map();
  const byTitle = new Map();

  for (const object of readArchivedObjects(paths)) {
    const metadata = normalizeMetadata(object);
    if (!metadata) continue;
    if (metadata.asin) byAsin.set(metadata.asin, metadata);
    if (metadata.title) byTitle.set(metadata.title, metadata);
  }

  return { byAsin, byTitle };
}

function asinFromBookId(bookId) {
  return /^A:([A-Z0-9]{10})-/i.exec(bookId)?.[1]?.toUpperCase();
}

function progress(current, maximum) {
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((current / maximum) * 10_000) / 100));
}

export function importKindleLibrary(targetDatabase, sourcePath = kindleDatabasePath) {
  if (!existsSync(sourcePath)) throw new Error(`Kindle-Datenbank nicht gefunden: ${sourcePath}`);

  const startedAt = new Date().toISOString();
  const run = targetDatabase
    .prepare(`INSERT INTO import_runs (source, started_at, status) VALUES ('kindle-macos', ?, 'running')`)
    .run(startedAt);

  try {
    const archivePaths = [sourcePath, `${sourcePath}-wal`].filter(existsSync);
    const metadata = metadataIndex(archivePaths);
    const kindleDataRoot = resolve(dirname(sourcePath), '..', '..');
    const kindle = new DatabaseSync(sourcePath, { readOnly: true });
    const rows = kindle
      .prepare(`
        SELECT
          ZBOOKID AS source_id,
          ZDISPLAYTITLE AS title,
          ZLANGUAGE AS language,
          ZMIMETYPE AS mime_type,
          ZPATH AS path,
          ZBUNDLEPATH AS bundle_path,
          ZRAWCURRENTPOSITION AS current_position,
          ZRAWMAXPOSITION AS max_position
        FROM ZBOOK
        WHERE COALESCE(ZRAWISDICTIONARY, 0) = 0
          AND COALESCE(ZRAWISHIDDEN, 0) = 0
          AND ZBOOKID IS NOT NULL
          AND ZDISPLAYTITLE IS NOT NULL
      `)
      .all();
    kindle.close();

    const upsert = targetDatabase.prepare(`
      INSERT INTO books (
        source, source_id, asin, title, authors, publisher, publication_date,
        language, content_type, progress_percent, current_position, max_position,
        is_downloaded, imported_at, updated_at
      ) VALUES (
        'kindle-macos', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT (source, source_id) DO UPDATE SET
        asin = excluded.asin,
        title = excluded.title,
        authors = excluded.authors,
        publisher = excluded.publisher,
        publication_date = excluded.publication_date,
        language = excluded.language,
        content_type = excluded.content_type,
        progress_percent = excluded.progress_percent,
        current_position = excluded.current_position,
        max_position = excluded.max_position,
        is_downloaded = excluded.is_downloaded,
        updated_at = excluded.updated_at
    `);

    let withAuthors = 0;
    targetDatabase.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) {
        const asin = asinFromBookId(row.source_id);
        const extra = (asin && metadata.byAsin.get(asin)) ?? metadata.byTitle.get(row.title);
        const authors = extra?.authors?.length ? extra.authors.join('; ') : null;
        if (authors) withAuthors += 1;
        const now = new Date().toISOString();

        upsert.run(
          row.source_id,
          asin ?? null,
          row.title,
          authors,
          extra?.publishers?.join('; ') || null,
          extra?.publicationDate ?? null,
          row.language ?? null,
          extra?.contentType ?? row.mime_type ?? null,
          progress(row.current_position, row.max_position),
          row.current_position || null,
          row.max_position || null,
          [row.path, row.bundle_path].some(
            (path) => typeof path === 'string' && existsSync(resolve(kindleDataRoot, path)),
          )
            ? 1
            : 0,
          startedAt,
          now,
        );
      }
      targetDatabase.exec('COMMIT');
    } catch (error) {
      targetDatabase.exec('ROLLBACK');
      throw error;
    }

    const finishedAt = new Date().toISOString();
    targetDatabase
      .prepare(`
        UPDATE import_runs
        SET finished_at = ?, records_seen = ?, records_imported = ?,
            records_with_authors = ?, status = 'complete', details = ?
        WHERE id = ?
      `)
      .run(
        finishedAt,
        rows.length,
        rows.length,
        withAuthors,
        JSON.stringify({ archivePaths, metadataByAsin: metadata.byAsin.size }),
        run.lastInsertRowid,
      );

    return {
      database: sourcePath,
      recordsSeen: rows.length,
      recordsImported: rows.length,
      recordsWithAuthors: withAuthors,
      progressRecords: rows.filter((row) => progress(row.current_position, row.max_position) != null).length,
    };
  } catch (error) {
    targetDatabase
      .prepare(`UPDATE import_runs SET finished_at = ?, status = 'failed', details = ? WHERE id = ?`)
      .run(new Date().toISOString(), String(error), run.lastInsertRowid);
    throw error;
  }
}
