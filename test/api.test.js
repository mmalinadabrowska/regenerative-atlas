import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, exportBibtex, exportJson, handlers, validateSubmission } from '../server/api.js';
import { openDatabase } from '../server/db.js';

const params = (query = '') => new URLSearchParams(query);

test('a submission without a link is refused', () => {
  assert.throws(() => validateSubmission({ title: 'X', tags: ['soil'] }), ApiError);
});

test('a submission without a tag is refused, with a reason a person can act on', () => {
  try {
    validateSubmission({ url: 'https://example.org/a', title: 'X', tags: [] });
    assert.fail('should have thrown');
  } catch (error) {
    assert.equal(error.status, 400);
    assert.match(error.message, /at least one tag/i);
  }
});

test('a submission without a title is refused', () => {
  assert.throws(() => validateSubmission({ url: 'https://example.org/a', tags: ['soil'] }), ApiError);
});

test('fields are trimmed and clamped, and tags capped at twelve', () => {
  const submission = validateSubmission({
    url: '  https://example.org/a  ',
    title: `  ${'t'.repeat(500)}  `,
    authors: 'A   B',
    summary: 's'.repeat(3000),
    tags: Array.from({ length: 40 }, (_, i) => `tag-${i}`),
  });
  assert.equal(submission.url, 'https://example.org/a');
  assert.equal(submission.title.length, 300);
  assert.equal(submission.authors, 'A B');
  assert.equal(submission.summary.length, 1200);
  // Twelve subjects, and then the place, which is not one of the twelve: the
  // cap is there so a source is not about everything, and where it is grounded
  // was never one of the things it is about.
  assert.equal(submission.tags.length, 13);
  assert.equal(submission.tags.at(-1), 'global');
});

test('tags may arrive as a comma-separated string', () => {
  const submission = validateSubmission({
    url: 'https://example.org/a',
    title: 'A',
    tags: 'timber, Circular Economy , ,LCA',
  });
  assert.deepEqual(submission.tags, ['timber', 'circular-economy', 'life-cycle-assessment', 'global']);
});

test('an implausible year is dropped rather than stored', () => {
  const year = (value) => validateSubmission({ url: 'https://e.org/a', title: 'A', tags: ['soil'], year: value }).year;
  assert.equal(year('2019'), 2019);
  assert.equal(year('Published 2019 in London'), 2019);
  assert.equal(year('1066'), null);
  assert.equal(year('nonsense'), null);
  assert.equal(year(''), null);
  assert.equal(year(3000), null);
});

test('line breaks survive in a contributor note but runs of blank lines do not', () => {
  const submission = validateSubmission({
    url: 'https://example.org/a',
    title: 'A',
    tags: ['soil'],
    note: 'First thought.\n\n\n\nSecond thought.',
  });
  assert.equal(submission.note, 'First thought.\n\nSecond thought.');
});

function seeded() {
  const atlas = openDatabase(':memory:');
  atlas.addSource({
    url: 'https://example.org/paper',
    title: 'On regenerative timber',
    authors: 'Rivera, Osei',
    publisher: 'Journal of Building',
    year: 2021,
    tags: ['timber', 'paper', 'carbon'],
    contributor: 'mal',
  });
  atlas.addSource({
    url: 'https://example.org/book',
    title: 'The living ground',
    authors: 'Okonkwo',
    year: 2018,
    tags: ['soil', 'book'],
  });
  return atlas;
}

test('the vocabulary endpoint hands back facets in a fixed order', () => {
  const { facets, tags } = handlers.vocabulary();
  assert.deepEqual(facets.map((f) => f.key), ['theme', 'location', 'material', 'method', 'scale', 'format', 'open']);
  assert.ok(tags.length > 40);
});

test('the vocabulary endpoint ships the alias table for the form to use', () => {
  const { aliases } = handlers.vocabulary();
  assert.ok(aliases.economics.includes('doughnut-economics'));
  assert.ok(aliases['life-cycle-assessment'].includes('lca'));
  // Every canonical key must be a tag that actually exists.
  const slugs = new Set(handlers.vocabulary().tags.map((t) => t.slug));
  for (const canonical of Object.keys(aliases)) {
    assert.ok(slugs.has(canonical), `${canonical} is an alias target but not a tag`);
  }
});

test('the tags endpoint groups by facet and drops unused vocabulary', () => {
  const { tags, facets } = handlers.tags(seeded());
  assert.deepEqual(new Set(tags.map((t) => t.slug)), new Set(['timber', 'paper', 'carbon', 'soil', 'book']));
  const format = facets.find((f) => f.key === 'format');
  assert.deepEqual(new Set(format.tags.map((t) => t.slug)), new Set(['paper', 'book']));
});

test('sources can be filtered by tag and searched', () => {
  const atlas = seeded();
  assert.equal(handlers.sources(atlas, params()).count, 2);
  assert.equal(handlers.sources(atlas, params('tag=timber')).count, 1);
  assert.equal(handlers.sources(atlas, params('q=ground')).count, 1);
  assert.equal(handlers.sources(atlas, params('tag=timber&q=ground')).count, 0);
});

test('stats count distinct contributors, not submissions', () => {
  const stats = handlers.stats(seeded());
  assert.equal(stats.sources, 2);
  assert.equal(stats.contributors, 1);
  assert.equal(stats.newest.length, 2);
});

test('submitting through the handler reports whether a node was created', () => {
  const atlas = seeded();
  const first = handlers.submit(atlas, { url: 'https://example.org/new', title: 'New', tags: ['soil'] });
  assert.equal(first.created, true);
  const second = handlers.submit(atlas, { url: 'https://example.org/new', title: 'New', tags: ['water'] });
  assert.equal(second.created, false);
  assert.equal(atlas.count(), 3);
});

test('the JSON export omits empty fields and keeps the tags', () => {
  const exported = exportJson(seeded());
  const record = exported.sources.find((s) => s.title === 'The living ground');
  assert.equal(record.publisher, undefined);
  assert.equal(record.contributor, undefined);
  assert.deepEqual(new Set(record.tags), new Set(['soil', 'book']));
  assert.ok(exported.exportedAt);
});

test('BibTeX export produces unique keys and the right entry types', () => {
  const bib = exportBibtex(seeded());
  assert.match(bib, /@article\{Rivera2021/);
  assert.match(bib, /@book\{Okonkwo2018/);
  assert.match(bib, /author = \{Rivera and Osei\}/);
  assert.match(bib, /url = \{https:\/\/example\.org\/paper\}/);

  const keys = [...bib.matchAll(/@\w+\{([^,]+),/g)].map((m) => m[1]);
    assert.equal(new Set(keys).size, keys.length, 'citation keys must be unique');
});

test('BibTeX escapes braces that would break a .bib file', () => {
  const atlas = openDatabase(':memory:');
  atlas.addSource({ url: 'https://example.org/x', title: 'A {tricky} title \\ here', tags: ['essay'] });
  const bib = exportBibtex(atlas);
  assert.equal(bib.includes('{tricky}'), false);
  assert.match(bib, /title = \{A tricky title here\}/);
});
