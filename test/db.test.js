import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, urlKey } from '../server/db.js';

const fresh = () => openDatabase(':memory:');

test('urlKey ignores the parts of a URL that are not the document', () => {
  const canonical = 'example.org/papers/regeneration';
  assert.equal(urlKey('https://example.org/papers/regeneration'), canonical);
  assert.equal(urlKey('https://www.example.org/papers/regeneration/'), canonical);
  assert.equal(urlKey('http://EXAMPLE.org/papers/regeneration#section-2'), canonical);
  assert.equal(urlKey('https://example.org/papers/regeneration?utm_source=twitter'), canonical);
  // Query parameters that actually select a document are kept, and sorted.
  assert.equal(urlKey('https://example.org/view?b=2&a=1'), 'example.org/view?a=1&b=2');
});

test('re-submitting a known link merges tags instead of duplicating the source', () => {
  const atlas = fresh();
  const first = atlas.addSource({
    url: 'https://example.org/paper',
    title: 'A paper',
    tags: ['timber', 'carbon'],
  });
  assert.equal(first.created, true);

  const again = atlas.addSource({
    url: 'https://www.example.org/paper/?utm_campaign=newsletter',
    title: 'The same paper, found by someone else',
    tags: ['diagrams'],
  });
  assert.equal(again.created, false);
  assert.equal(atlas.count(), 1);
  assert.deepEqual(
    new Set(again.source.tags.map((t) => t.slug)),
    new Set(['timber', 'carbon', 'diagrams']),
  );
  // The first contributor's title stands; the second person's tags are added.
  assert.equal(again.source.title, 'A paper');
});

test('tags are canonicalised on the way in', () => {
  const atlas = fresh();
  const { source } = atlas.addSource({
    url: 'https://example.org/x',
    title: 'X',
    tags: ['LCA', 'circularity', 'Cross Laminated'],
  });
  assert.deepEqual(
    new Set(source.tags.map((t) => t.slug)),
    new Set(['life-cycle-assessment', 'circular-economy', 'timber']),
  );
});

test('tag counts only reflect published sources', () => {
  const atlas = fresh();
  atlas.addSource({ url: 'https://example.org/a', title: 'A', tags: ['soil'] });
  const { source } = atlas.addSource({ url: 'https://example.org/b', title: 'B', tags: ['soil'] });
  assert.equal(atlas.tagsWithCounts().find((t) => t.slug === 'soil').count, 2);

  atlas.setStatus(source.id, 'hidden');
  assert.equal(atlas.tagsWithCounts().find((t) => t.slug === 'soil').count, 1);
  assert.equal(atlas.count(), 1);
  assert.equal(atlas.listSources({}).length, 1);
});

test('search reaches title, summary and authors, and survives odd input', () => {
  const atlas = fresh();
  atlas.addSource({
    url: 'https://example.org/straw',
    title: 'Building with straw',
    authors: 'Aalto',
    summary: 'A study of load-bearing bales in cold climates.',
    tags: ['straw'],
  });
  atlas.addSource({ url: 'https://example.org/other', title: 'Concrete futures', tags: ['concrete'] });

  assert.deepEqual(atlas.listSources({ query: 'straw' }).map((s) => s.title), ['Building with straw']);
  assert.deepEqual(atlas.listSources({ query: 'bales' }).map((s) => s.title), ['Building with straw']);
  assert.deepEqual(atlas.listSources({ query: 'Aalto' }).map((s) => s.title), ['Building with straw']);
  // FTS5 syntax must never reach the tokeniser raw.
  assert.doesNotThrow(() => atlas.listSources({ query: 'straw OR ((' }));
  assert.doesNotThrow(() => atlas.listSources({ query: '"' }));
});

test('filtering by several tags intersects rather than unions', () => {
  const atlas = fresh();
  atlas.addSource({ url: 'https://example.org/1', title: 'One', tags: ['timber', 'carbon'] });
  atlas.addSource({ url: 'https://example.org/2', title: 'Two', tags: ['timber'] });
  assert.equal(atlas.listSources({ tags: ['timber'] }).length, 2);
  assert.equal(atlas.listSources({ tags: ['timber', 'carbon'] }).length, 1);
  assert.equal(atlas.listSources({ tags: ['timber', 'mycelium'] }).length, 0);
});
