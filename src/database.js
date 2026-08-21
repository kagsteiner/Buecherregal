import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { databasePath, projectRoot } from './config.js';

export function openDatabase(path = databasePath) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  return database;
}

export function migrate(database) {
  const version = database.prepare('PRAGMA user_version').get().user_version;
  if (version < 1) {
    database.exec(readFileSync(join(projectRoot, 'migrations', '001_initial.sql'), 'utf8'));
  }
  if (version < 2) {
    database.exec(readFileSync(join(projectRoot, 'migrations', '002_book_metadata.sql'), 'utf8'));
  }
  if (version < 3) {
    database.exec(readFileSync(join(projectRoot, 'migrations', '003_spine_colors.sql'), 'utf8'));
  }
  if (version < 4) {
    database.exec(readFileSync(join(projectRoot, 'migrations', '004_hidden_books.sql'), 'utf8'));
  }
  if (version < 5) {
    database.exec(readFileSync(join(projectRoot, 'migrations', '005_book_typography.sql'), 'utf8'));
  }
  if (version < 6) {
    database.exec(readFileSync(join(projectRoot, 'migrations', '006_local_covers.sql'), 'utf8'));
  }
  database.exec('PRAGMA optimize');
}
