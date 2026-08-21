#!/usr/bin/env node
import { databasePath } from './config.js';
import { migrate, openDatabase } from './database.js';
import { importKindleLibrary } from './kindle/import.js';
import { enrichPageCounts } from './metadata/enrich-pages.js';
import { enrichSpineColors } from './metadata/enrich-colors.js';

function usage() {
  console.log(`Bücherregal

Aufrufe:
  npm run db:init
  npm run kindle:import
  npm run metadata:pages
  npm run metadata:colors
  npm run books:list

Datenbank: ${databasePath}`);
}

const command = process.argv[2];

if (!command || command === '--help' || command === '-h') {
  usage();
  process.exit(0);
}

const database = openDatabase();
migrate(database);
let databaseClosed = false;

try {
  if (command === 'init') {
    console.log(`SQLite-Datenbank initialisiert: ${databasePath}`);
  } else if (command === 'import-kindle') {
    const result = importKindleLibrary(database);
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'list') {
    const books = database
      .prepare(`
        SELECT title, authors, progress_percent
        FROM books
        ORDER BY COALESCE(authors, ''), title
      `)
      .all();
    console.table(books);
    console.log(`${books.length} Bücher`);
  } else if (command === 'enrich-pages') {
    database.close();
    databaseClosed = true;
    const limit = Number(process.env.METADATA_LIMIT || 0) || undefined;
    const result = await enrichPageCounts({ limit });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'enrich-colors') {
    database.close();
    databaseClosed = true;
    const limit = Number(process.env.COLOR_LIMIT || 0) || undefined;
    const result = await enrichSpineColors({ limit });
    console.log(JSON.stringify(result, null, 2));
  } else {
    usage();
    process.exitCode = 1;
  }
} finally {
  if (!databaseClosed) database.close();
}
