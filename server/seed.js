/**
 * Loads data/seed.json into the database.
 *
 * `npm run seed` adds anything missing and leaves existing rows alone.
 * `npm run reset` deletes the database first and rebuilds from scratch.
 */

import { readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DB_PATH, openDatabase } from './db.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function seed({ reset = false, dbPath = DEFAULT_DB_PATH, quiet = false } = {}) {
  if (reset && dbPath !== ':memory:') {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${dbPath}${suffix}`, { force: true });
    }
  }

  const { sources } = JSON.parse(readFileSync(resolve(ROOT, 'data', 'seed.json'), 'utf8'));
  const atlas = openDatabase(dbPath);

  let added = 0;
  for (const entry of sources) {
    const { created } = atlas.addSource({ ...entry, origin: 'seed' });
    if (created) added++;
  }

  if (!quiet) {
    console.log(`  seeded ${added} new of ${sources.length} · ${atlas.count()} sources in the Atlas`);
  }
  return { atlas, added, total: atlas.count() };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const { atlas } = seed({ reset: process.argv.includes('--reset') });
  atlas.close();
}
