import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COLUMNS,
  describeChanges,
  libraryRows,
  parseCsv,
  readLibrary,
  toCsv,
} from '../scripts/library.mjs';

const SEED_TEXT = readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8');
const seed = JSON.parse(SEED_TEXT);

/** A header and the given rows, with blanks for every column not named. */
const sheet = (...records) => [
  COLUMNS,
  ...records.map((record) => COLUMNS.map((name) => String(record[name] ?? ''))),
];

const good = {
  title: 'An example record',
  url: 'https://example.org/doughnut/',
  year: '2017',
  tags: 'Systems thinking',
};

test('CSV survives what spreadsheets put in a cell', () => {
  const rows = [
    ['plain', 'with, comma', 'with "quotes"'],
    ['line\nbreak', 'Łódź — naïve café', ''],
  ];
  const text = toCsv(rows);
  assert.ok(text.startsWith('﻿'), 'starts with a byte-order mark for Excel');
  assert.deepEqual(parseCsv(text), rows);
});

test('CSV saved with semicolons, LF and no mark is read the same', () => {
  const text = '"title";"url"\n"A; B";https://example.org/\n\n';
  assert.deepEqual(parseCsv(text), [
    ['title', 'url'],
    ['A; B', 'https://example.org/'],
  ]);
});

test('export then import gives back seed.json byte for byte', () => {
  const rows = parseCsv(toCsv(libraryRows(seed)));
  const { sources, problems } = readLibrary(rows);
  assert.deepEqual(problems, []);
  assert.equal(JSON.stringify({ ...seed, sources }, null, 2) + '\n', SEED_TEXT);
  assert.deepEqual(describeChanges(seed.sources, sources).lines, []);
});

test('columns can be moved, and ones the import does not know are ignored', () => {
  const rows = sheet(good);
  const reordered = rows.map((row) => [...row].reverse().concat(['checked by Malina']));
  reordered[0][reordered[0].length - 1] = 'my notes';
  const { sources, problems } = readLibrary(reordered);
  assert.deepEqual(problems, []);
  assert.equal(sources[0].title, 'An example record');
  assert.equal(sources[0].year, 2017);
});

test('tags are read as the site shows them, aliases included, places last', () => {
  const { sources, problems } = readLibrary(
    sheet({ ...good, tags: 'LCA; circularity', places: 'UK' }),
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(sources[0].tags, ['life-cycle-assessment', 'circular-economy', 'uk']);
});

test('a misspelt tag stops the import unless new tags are allowed', () => {
  const rows = sheet({ ...good, tags: 'Systems thinkng' });
  const refused = readLibrary(rows);
  assert.equal(refused.problems.length, 1);
  assert.match(refused.problems[0], /systems-thinkng.*row 2/);

  const allowed = readLibrary(rows, { allowNewTags: true });
  assert.deepEqual(allowed.problems, []);
  assert.deepEqual(allowed.newTags.map((t) => t.slug), ['systems-thinkng']);
});

test('broken rows are named by the row number the spreadsheet shows', () => {
  const { problems } = readLibrary(
    sheet(
      good,
      { ...good, url: 'https://example.org/doughnut' },
      { ...good, url: 'not a link', title: 'B' },
      { ...good, url: 'https://c.org/', year: '20017' },
      { ...good, url: 'https://d.org/', title: '' },
      { ...good, url: 'https://e.org/', tags: '', places: 'UK' },
    ),
  );
  assert.equal(problems.length, 5);
  assert.match(problems[0], /^Row 3: .*same link as row 2/);
  assert.match(problems[1], /^Row 4: .*not a link/);
  assert.match(problems[2], /^Row 5: .*not a year/);
  assert.match(problems[3], /^Row 6: .*no title/);
  assert.match(problems[4], /^Row 7: .*no tags besides places/);
});

test('changes are listed as added, edited and removed', () => {
  const [first, second, ...rest] = seed.sources;
  const after = [{ ...first, year: 1066 }, ...rest, { ...good, tags: ['systems-thinking'] }];
  const { lines, unchanged } = describeChanges(seed.sources, after);
  assert.equal(unchanged, rest.length);
  assert.ok(lines.includes(`  ~ ${first.title}  (year)`));
  assert.ok(lines.includes(`  + ${good.title}`));
  assert.ok(lines.includes(`  − ${second.title}`));
});
