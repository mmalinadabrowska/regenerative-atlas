/**
 * The library as a spreadsheet, and back again.
 *
 *   npm run library:export   data/seed.json  ->  data/library.csv
 *                                                data/vocabulary.csv
 *   npm run library:import   data/library.csv ->  data/seed.json
 *
 * data/seed.json is the library: every other copy — the local database, the
 * snapshot the website draws, the rows in Supabase — is rebuilt from it. So the
 * way to edit the library by hand is to edit that file, and a spreadsheet is a
 * far better place to read and correct twenty-eight records than a JSON file.
 *
 * The export is for reading as much as for editing: one row a record, every
 * field in its own column, tags written as the words the site shows rather than
 * as the slugs it stores. The import is strict, because a typo in a tag is not
 * a typo — it is a new island on the map. Nothing is written unless every row
 * is sound, and every change is listed before it is.
 *
 * Any column the import does not know is ignored, so a spreadsheet can carry a
 * reviewer's own notes — "checked", "link moved", "ask the author" — through
 * as many rounds as it takes.
 *
 * No dependencies: CSV is a small format, and the rules are all here.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urlKey } from '../server/keys.js';
import { CORE_TAGS, FACETS, isLocation, resolveTag, writeTag } from '../server/vocabulary.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = resolve(ROOT, 'data', 'seed.json');
const LIBRARY = resolve(ROOT, 'data', 'library.csv');
const VOCABULARY = resolve(ROOT, 'data', 'vocabulary.csv');

/** The columns, in the order a reader wants them. `#` is for talking about a row. */
export const COLUMNS = [
  '#',
  'title',
  'url',
  'authors',
  'publisher',
  'year',
  'summary',
  'note',
  'contributor',
  'tags',
  'places',
];

/** How several tags share one cell. A semicolon, because titles have commas. */
const SEPARATOR = '; ';

const CORE = new Map(CORE_TAGS.map((tag) => [tag.slug, tag]));
const labelOf = (slug) => CORE.get(slug)?.label ?? slug;

/* --- CSV ----------------------------------------------------------------- */

/**
 * One field, quoted. Every field is quoted, not only the ones that need it:
 * a summary with a comma in it is the ordinary case here, and one rule is
 * easier to trust than two.
 */
const field = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/**
 * Rows to CSV text. A byte-order mark first, because without one Excel opens
 * UTF-8 as something older and every ö in the library becomes two characters;
 * CRLF line ends, because that is what the format says and what Excel writes.
 */
export function toCsv(rows) {
  return '﻿' + rows.map((row) => row.map(field).join(',')).join('\r\n') + '\r\n';
}

/**
 * CSV text to rows of strings. Handles what spreadsheets actually write:
 * quoted fields with doubled quotes and line breaks inside them, CRLF or LF,
 * a byte-order mark or none, and — because Excel in much of Europe saves
 * "CSV" with semicolons — whichever of comma or semicolon the header uses.
 */
export function parseCsv(text) {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const delimiter =
    (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ';' : ',';

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // A last line break leaves nothing behind it; neither does a row of blanks.
  return rows.filter((r) => r.some((value) => value.trim() !== ''));
}

/* --- out ------------------------------------------------------------------ */

/** The library as rows: a header, then a record a row. */
export function libraryRows(seed) {
  return [
    COLUMNS,
    ...seed.sources.map((source, i) => {
      // Everything that is not a place — themes, scales, kinds of work — then
      // the places on their own, because those are the ones most often wrong.
      const tags = source.tags.filter((slug) => !isLocation(slug)).map(labelOf);
      const places = source.tags.filter((slug) => isLocation(slug)).map(labelOf);
      return [
        i + 1,
        source.title,
        source.url,
        source.authors ?? '',
        source.publisher ?? '',
        source.year ?? '',
        source.summary ?? '',
        source.note ?? '',
        source.contributor ?? '',
        tags.join(SEPARATOR),
        places.join(SEPARATOR),
      ];
    }),
  ];
}

/** Every word a record can be filed under, so the choices are on the table. */
export function vocabularyRows() {
  return [
    ['label', 'kind', 'meaning'],
    ...CORE_TAGS.map((tag) => [tag.label, FACETS[tag.facet]?.label ?? tag.facet, tag.note ?? '']),
  ];
}

/* --- in ------------------------------------------------------------------- */

class RowError extends Error {}

const splitTags = (cell) =>
  String(cell ?? '')
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * The spreadsheet back into records, checked. Returns { sources, problems,
 * newTags }: problems stop the import; new tags stop it too unless allowed,
 * because a misspelt tag would quietly become an island of its own.
 */
export function readLibrary(rows, { allowNewTags = false } = {}) {
  const [header, ...body] = rows;
  if (!header) return { sources: [], problems: ['The file is empty.'], newTags: [] };

  const at = new Map(header.map((name, i) => [name.trim().toLowerCase(), i]));
  const problems = [];
  for (const required of ['title', 'url']) {
    if (!at.has(required)) problems.push(`There is no "${required}" column.`);
  }
  if (problems.length) return { sources: [], problems, newTags: [] };

  const cell = (row, name) => (at.has(name) ? String(row[at.get(name)] ?? '').trim() : '');
  const thisYear = new Date().getFullYear();
  const seen = new Map();
  const newTags = new Map();
  const sources = [];

  body.forEach((row, i) => {
    // The row number a spreadsheet shows: the header is row 1.
    const line = i + 2;
    try {
      const title = cell(row, 'title');
      const url = cell(row, 'url');
      if (!title) throw new RowError('it has no title');
      if (!url) throw new RowError('it has no link');
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new RowError(`"${url}" is not a link`);
      }
      if (!/^https?:$/.test(parsed.protocol)) throw new RowError(`"${url}" is not a web link`);

      const key = urlKey(url);
      if (seen.has(key)) throw new RowError(`it is the same link as row ${seen.get(key)}`);
      seen.set(key, line);

      const yearText = cell(row, 'year');
      let year = null;
      if (yearText) {
        year = Number(yearText);
        if (!Number.isInteger(year) || year < 1400 || year > thisYear + 2) {
          throw new RowError(`"${yearText}" is not a year`);
        }
      }

      // Tags and places are read together and put back in that order: the
      // columns are a convenience for the reader, the record has one list.
      const slugs = [];
      for (const written of [...splitTags(cell(row, 'tags')), ...splitTags(cell(row, 'places'))]) {
        const tag = resolveTag(written);
        if (!tag) continue;
        // A coined tag keeps its facet in front — "material:cork" — so it goes
        // back among the materials rather than the open tags.
        const stored = writeTag(tag);
        if (!CORE.has(tag.slug)) {
          if (!newTags.has(stored)) newTags.set(stored, []);
          newTags.get(stored).push(line);
        }
        if (!slugs.includes(stored)) slugs.push(stored);
      }
      if (!slugs.some((slug) => !isLocation(slug))) {
        throw new RowError('it has no tags besides places — everything on the map needs at least one');
      }
      const tags = [...slugs.filter((s) => !isLocation(s)), ...slugs.filter((s) => isLocation(s))];

      const record = {
        url,
        title,
        authors: cell(row, 'authors'),
        publisher: cell(row, 'publisher'),
        year,
        summary: cell(row, 'summary'),
      };
      // Only written down when there is something to write, so a round trip
      // with nothing edited leaves the file exactly as it was.
      const note = cell(row, 'note');
      const contributor = cell(row, 'contributor');
      if (note) record.note = note;
      if (contributor) record.contributor = contributor;
      record.tags = tags;
      sources.push(record);
    } catch (error) {
      if (!(error instanceof RowError)) throw error;
      problems.push(`Row ${line}: ${error.message}.`);
    }
  });

  const unknown = [...newTags].map(([slug, lines]) => ({ slug, lines }));
  if (unknown.length && !allowNewTags) {
    for (const { slug, lines } of unknown) {
      problems.push(
        `"${slug}" (row${lines.length > 1 ? 's' : ''} ${lines.join(', ')}) is not in the vocabulary — ` +
          'check the spelling against data/vocabulary.csv, or run the import with --allow-new-tags ' +
          'if it is meant to be a new one.',
      );
    }
  }
  return { sources, problems, newTags: unknown };
}

/** What an import would change, record by record, matched on the link. */
export function describeChanges(before, after) {
  const byKey = (list) => new Map(list.map((s) => [urlKey(s.url), s]));
  const old = byKey(before);
  const now = byKey(after);
  const fields = ['title', 'url', 'authors', 'publisher', 'year', 'summary', 'note', 'contributor', 'tags'];
  const lines = [];
  let unchanged = 0;
  for (const [key, source] of now) {
    const was = old.get(key);
    if (!was) {
      lines.push(`  + ${source.title}`);
      continue;
    }
    const moved = fields.filter(
      (name) => JSON.stringify(was[name] ?? '') !== JSON.stringify(source[name] ?? ''),
    );
    if (moved.length) lines.push(`  ~ ${source.title}  (${moved.join(', ')})`);
    else unchanged++;
  }
  for (const [key, source] of old) if (!now.has(key)) lines.push(`  − ${source.title}`);
  return { lines, unchanged };
}

/* --- the commands --------------------------------------------------------- */

function exportLibrary() {
  const seed = JSON.parse(readFileSync(SEED, 'utf8'));
  writeFileSync(LIBRARY, toCsv(libraryRows(seed)));
  writeFileSync(VOCABULARY, toCsv(vocabularyRows()));
  console.log(
    `\n  data/library.csv     ${seed.sources.length} records, one a row` +
      `\n  data/vocabulary.csv  ${CORE_TAGS.length} tags a record can be filed under\n` +
      '\n  Edit library.csv in any spreadsheet, save it as CSV (UTF-8) in the same place,' +
      '\n  and run  npm run library:import\n',
  );
}

function importLibrary({ allowNewTags }) {
  let text;
  try {
    text = readFileSync(LIBRARY, 'utf8');
  } catch {
    console.error('\n  There is no data/library.csv — run  npm run library:export  first.\n');
    process.exit(1);
  }
  if (text.includes('�')) {
    console.error(
      '\n  data/library.csv is not UTF-8, so some letters have been lost (look for ö, é, —).' +
        '\n  Save it again choosing "CSV UTF-8" (Excel) or "Unicode (UTF-8)" (Numbers).\n',
    );
    process.exit(1);
  }

  const { sources, problems, newTags } = readLibrary(parseCsv(text), { allowNewTags });
  if (problems.length) {
    console.error('\n  Nothing was written. Put these right and run it again:\n');
    for (const problem of problems) console.error(`  • ${problem}`);
    console.error('');
    process.exit(1);
  }

  const seed = JSON.parse(readFileSync(SEED, 'utf8'));
  const { lines, unchanged } = describeChanges(seed.sources, sources);
  if (!lines.length) {
    console.log(`\n  No changes — the library already reads exactly as the spreadsheet does.\n`);
    return;
  }

  writeFileSync(SEED, JSON.stringify({ ...seed, sources }, null, 2) + '\n');
  console.log(`\n  data/seed.json rewritten — ${sources.length} records:\n`);
  for (const line of lines) console.log(line);
  if (unchanged) console.log(`    and ${unchanged} unchanged`);
  if (newTags.length) console.log(`\n  New tags: ${newTags.map((t) => t.slug).join(', ')}`);
  console.log(
    '\n  Then:' +
      '\n    npm run reset          the local database, rebuilt from it' +
      '\n    npm run build-static   what the website draws, rebuilt from that' +
      '\n    npm run supabase-sql   and paste supabase/replace-library.sql into Supabase' +
      '\n    commit and push' +
      '\n\n  Changed your mind?  git checkout data/seed.json  puts it back.\n',
  );
}

const [command, ...flags] = process.argv.slice(2);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (command === 'export') exportLibrary();
  else if (command === 'import') importLibrary({ allowNewTags: flags.includes('--allow-new-tags') });
  else {
    console.error('\n  npm run library:export   or   npm run library:import\n');
    process.exit(1);
  }
}
