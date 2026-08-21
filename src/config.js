import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const projectRoot = resolve(import.meta.dirname, '..');
export const databasePath = resolve(
  process.env.BOOKSHELF_DATABASE ?? join(projectRoot, 'data', 'bookshelf.sqlite'),
);

export const kindleDatabasePath = resolve(
  process.env.KINDLE_DATABASE ??
    join(
      homedir(),
      'Library',
      'Containers',
      'com.amazon.Lassen',
      'Data',
      'Library',
      'Protected',
      'BookData.sqlite',
    ),
);
