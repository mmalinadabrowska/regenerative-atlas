/**
 * Write the whole library out as SQL, for filling a Supabase project from a
 * browser.
 *
 *   npm run supabase-sql        -> supabase/seed.sql
 *
 * `npm run supabase push` does the same job over the network, and is the right
 * tool once the Atlas is running somewhere with credentials. This is for before
 * that: paste the file into the project's SQL editor and the library is there,
 * with no terminal, no Node, and no keys copied anywhere.
 *
 * Everything it writes can be run twice. Sources are matched on their URL key,
 * tags on their slug, and the ties between them on both — so a second run adds
 * what is new and leaves the rest alone.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, urlKey } from '../server/db.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A Postgres string literal, or NULL. Quotes are doubled, which is the whole rule. */
const text = (value) =>
  value === null || value === undefined || value === ''
    ? 'null'
    : `'${String(value).replace(/'/g, "''")}'`;

const number = (value) => (Number.isFinite(value) ? String(value) : 'null');

const atlas = openDatabase();
const sources = atlas.listSources({ limit: 10000 });
const tags = atlas.tagsWithCounts();

const lines = [
  '-- The Regenerative Atlas library, as SQL.',
  '--',
  '-- Paste this into the Supabase project\'s SQL editor and run it, after',
  '-- supabase/schema.sql has made the tables. Safe to run more than once:',
  '-- sources are matched on their link, tags on their slug.',
  `--`,
  `-- ${sources.length} sources, ${tags.length} tags. Written ${new Date().toISOString().slice(0, 10)}.`,
  '',
  '-- The vocabulary first, so the ties below have something to point at.',
  'insert into tags (slug, label, facet, note, core) values',
];

lines.push(
  tags
    .map(
      (tag) =>
        `  (${text(tag.slug)}, ${text(tag.label)}, ${text(tag.facet)}, ${text(tag.note)}, ${
          tag.core ? 'true' : 'false'
        })`,
    )
    .join(',\n') + '\non conflict (slug) do update set',
  '  label = excluded.label, facet = excluded.facet, note = excluded.note, core = excluded.core;',
  '',
  '-- The research.',
  'insert into sources (url, url_key, title, authors, publisher, year, summary, note, contributor, status, origin, created_at) values',
);

lines.push(
  sources
    .map(
      (source) =>
        `  (${text(source.url)}, ${text(urlKey(source.url))}, ${text(source.title)}, ` +
        `${text(source.authors)}, ${text(source.publisher)}, ${number(source.year)}, ` +
        `${text(source.summary)}, ${text(source.note)}, ${text(source.contributor)}, ` +
        `${text(source.status ?? 'published')}, ${text(source.origin ?? 'seed')}, ` +
        `${text(source.created_at)}::timestamptz)`,
    )
    .join(',\n') + '\non conflict (url_key) do nothing;',
  '',
  '-- What is filed where. Matched on the link and the slug, so no ids are',
  '-- written down anywhere and the file stays true whatever order things',
  '-- were inserted in.',
  'insert into source_tags (source_id, tag_id)',
  'select s.id, t.id from sources s, tags t where (s.url_key, t.slug) in (',
);

const ties = sources.flatMap((source) =>
  source.tags.map((tag) => `  (${text(urlKey(source.url))}, ${text(tag.slug)})`),
);
// No begin/commit: the SQL editor runs a query in its own transaction, and a
// first-timer does not need a warning about one already being in progress.
lines.push(ties.join(',\n'), ') on conflict do nothing;', '');

const sql = lines.join('\n');
writeFileSync(resolve(ROOT, 'supabase', 'seed.sql'), sql);
atlas.close();

console.log(
  `\n  supabase/seed.sql — ${sources.length} sources, ${tags.length} tags, ${ties.length} ties` +
    `  (${(sql.length / 1024).toFixed(0)} KB)\n`,
);
