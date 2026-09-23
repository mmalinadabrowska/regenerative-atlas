import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { buildGraph, idfWeights, kinship, labelPropagate } from '../server/graph.js';

/** A small library with three obvious territories and one deliberate outlier. */
function library() {
  const atlas = openDatabase(':memory:');
  const add = (title, tags) =>
    atlas.addSource({ url: `https://example.org/${title.replace(/\s+/g, '-')}`, title, tags });

  add('Timber tower', ['timber', 'materials', 'building', 'case-study']);
  add('Mass timber LCA', ['timber', 'life-cycle-assessment', 'carbon', 'paper']);
  add('Embodied carbon primer', ['carbon', 'life-cycle-assessment', 'building', 'guidance']);
  add('Reuse toolkit', ['reuse', 'materials', 'toolkit', 'circular-economy']);
  add('Material passports', ['reuse', 'materials', 'circular-economy', 'building']);
  add('Soil and the city', ['soil', 'city', 'ecology', 'essay']);
  add('Urban ecology reader', ['soil', 'ecology', 'city', 'book']);
  add('A lone star', ['glossary']);
  return atlas;
}

test('idf makes a rare tag worth more than a common one', () => {
  const atlas = library();
  const tagMap = atlas.tagMap();
  const idf = idfWeights(tagMap, atlas.count());
  assert.ok(idf.get('glossary') > idf.get('materials'));
});

test('kinship is symmetric, bounded, and 1 for identical vocabularies', () => {
  const idf = new Map([['a', 1], ['b', 2], ['c', 3]]);
  assert.equal(kinship(['a', 'b'], ['a', 'b'], idf), 1);
  assert.equal(kinship(['a'], ['c'], idf), 0);
  assert.equal(kinship([], ['a'], idf), 0);
  const forward = kinship(['a', 'b'], ['b', 'c'], idf);
  assert.equal(forward, kinship(['b', 'c'], ['a', 'b'], idf));
  assert.ok(forward > 0 && forward < 1);
});

test('one shared uncommon tag outweighs one shared common tag', () => {
  const idf = new Map([['common', 0.2], ['rare', 4]]);
  const viaRare = kinship(['rare', 'x'], ['rare', 'y'], new Map([...idf, ['x', 1], ['y', 1]]));
  const viaCommon = kinship(['common', 'x'], ['common', 'y'], new Map([...idf, ['x', 1], ['y', 1]]));
  assert.ok(viaRare > viaCommon);
});

test('label propagation puts a connected pair in one community', () => {
  const adjacency = new Map([
    ['a', new Map([['b', 1]])],
    ['b', new Map([['a', 1]])],
    ['c', new Map()],
  ]);
  const labels = labelPropagate(['a', 'b', 'c'], adjacency);
  assert.equal(labels.get('a'), labels.get('b'));
  assert.notEqual(labels.get('c'), labels.get('a'));
});

test('the graph clusters the vocabulary and names each cluster', () => {
  const graph = buildGraph(library());
  assert.equal(graph.stats.sources, 8);
  assert.ok(graph.clusters.length >= 2, 'a library with distinct territories should cluster');

  for (const cluster of graph.clusters) {
    assert.ok(cluster.label, 'every cluster needs a name');
    assert.ok(cluster.tags.length > 0);
    assert.equal(typeof cluster.id, 'number');
  }

  // Cluster ids are a dense, stable ordering by weight.
  assert.deepEqual(graph.clusters.map((c) => c.id), graph.clusters.map((_, i) => i));
});

test('sources that share a subject land in the same cluster', () => {
  const graph = buildGraph(library());
  const clusterOf = (title) => graph.nodes.find((n) => n.label === title).cluster;
  assert.equal(clusterOf('Soil and the city'), clusterOf('Urban ecology reader'));
  assert.equal(clusterOf('Reuse toolkit'), clusterOf('Material passports'));
});

test('kin lines connect related work and skip the unrelated', () => {
  const graph = buildGraph(library());
  const kin = graph.links.filter((l) => l.kind === 'kin');
  const idOf = (title) => graph.nodes.find((n) => n.label === title).id;
  const joined = (a, b) =>
    kin.some(
      (l) =>
        (l.source === idOf(a) && l.target === idOf(b)) ||
        (l.source === idOf(b) && l.target === idOf(a)),
    );

  assert.ok(joined('Soil and the city', 'Urban ecology reader'));
  assert.ok(joined('Reuse toolkit', 'Material passports'));
  assert.equal(joined('Timber tower', 'Soil and the city'), false);

  for (const link of kin) {
    assert.ok(link.weight > 0 && link.weight <= 1);
    assert.ok(Array.isArray(link.shared));
  }
});

test('a source sharing nothing gets no kin line rather than a false one', () => {
  const graph = buildGraph(library());
  const lone = graph.nodes.find((n) => n.label === 'A lone star');
  const kin = graph.links.filter(
    (l) => l.kind === 'kin' && (l.source === lone.id || l.target === lone.id),
  );
  assert.equal(kin.length, 0);
});

test('no source is left with fewer lines than it deserves', () => {
  const graph = buildGraph(library());
  const degree = new Map();
  for (const link of graph.links.filter((l) => l.kind === 'kin')) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }
  const orphans = graph.nodes
    .filter((n) => n.type === 'source' && n.tags.length > 1 && !degree.has(n.id))
    .map((n) => n.label);
  assert.deepEqual(orphans, [], 'a well-tagged source should reach the rest of the map');
});

test('the same library always draws the same map', () => {
  const atlas = library();
  const a = buildGraph(atlas);
  const b = buildGraph(atlas);
  assert.deepEqual(a.clusters, b.clusters);
  assert.deepEqual(
    a.nodes.map((n) => [n.id, n.cluster]),
    b.nodes.map((n) => [n.id, n.cluster]),
  );
  assert.deepEqual(a.links, b.links);
});

test('one source spanning several territories does not merge them', () => {
  // Label propagation on a dense tag graph collapses into a single giant
  // community, and a well-meaning contributor tagging across three subjects is
  // enough to trigger it. Adjacency is pruned to each tag's strongest ties to
  // stop that; this is the guard on it.
  const atlas = library();
  const before = buildGraph(atlas).clusters.length;
  assert.ok(before >= 3, 'the fixture should start with distinct territories');

  atlas.addSource({
    url: 'https://example.org/bridge',
    title: 'Everything, everywhere',
    tags: ['timber', 'soil', 'reuse', 'carbon', 'ecology', 'materials', 'city'],
  });

  const after = buildGraph(atlas).clusters.length;
  assert.ok(after > 1, `a single bridging source collapsed the map to ${after} cluster(s)`);
  assert.ok(
    after >= before - 1,
    `clusters fell from ${before} to ${after} on one added source`,
  );
});

test('every link points at a node that exists', () => {
  const graph = buildGraph(library());
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const link of graph.links) {
    assert.ok(ids.has(link.source), `dangling source ${link.source}`);
    assert.ok(ids.has(link.target), `dangling target ${link.target}`);
  }
});

test('filtering narrows the map to the sources that survive', () => {
  const graph = buildGraph(library(), { filterTags: ['materials'] });
  assert.equal(graph.stats.sources, 3);
  for (const node of graph.nodes.filter((n) => n.type === 'source')) {
    assert.ok(node.tags.includes('materials'));
  }
});

test('an empty library produces an empty but well-formed map', () => {
  const graph = buildGraph(openDatabase(':memory:'));
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.links, []);
  assert.deepEqual(graph.clusters, []);
  assert.equal(graph.stats.sources, 0);
});

/* --- places --------------------------------------------------------------- */

/** The same library, with each piece of work grounded somewhere. */
function groundedLibrary() {
  const atlas = openDatabase(':memory:');
  const add = (title, tags) =>
    atlas.addSource({ url: `https://example.org/${title.replace(/\s+/g, '-')}`, title, tags });

  add('Timber tower', ['timber', 'materials', 'building', 'case-study', 'denmark']);
  add('Mass timber LCA', ['timber', 'life-cycle-assessment', 'carbon', 'paper', 'uk']);
  add('Embodied carbon primer', ['carbon', 'life-cycle-assessment', 'building', 'guidance', 'uk']);
  add('Soil and the city', ['soil', 'city', 'ecology', 'essay', 'kenya']);
  add('Urban ecology reader', ['soil', 'ecology', 'city', 'book', 'global']);
  return atlas;
}

test('a place is never drawn: the islands are subjects, not addresses', () => {
  const atlas = groundedLibrary();
  const graph = buildGraph(atlas);
  const drawn = graph.nodes.filter((n) => n.type === 'tag').map((n) => n.slug);
  for (const place of ['denmark', 'uk', 'europe', 'kenya', 'africa', 'global']) {
    assert.ok(!drawn.includes(place), `${place} was drawn`);
  }
  assert.ok(drawn.includes('timber'));
  atlas.close();
});

test('two sources are not made kin by sharing a continent', () => {
  const atlas = groundedLibrary();
  const graph = buildGraph(atlas);
  const byName = (label) => graph.nodes.find((n) => n.label === label);
  const timber = byName('Timber tower');
  const soil = byName('Soil and the city');
  // Nothing in common but the fact that both are somewhere.
  const kin = graph.links.filter(
    (l) => l.kind === 'kin' &&
      [l.source, l.target].includes(timber.id) &&
      [l.source, l.target].includes(soil.id),
  );
  assert.equal(kin.length, 0);
  // And no source carries a place among the tags the drawing works from.
  for (const node of graph.nodes.filter((n) => n.type === 'source')) {
    assert.ok(!node.tags.includes('europe'), node.label);
  }
  atlas.close();
});

test('the record still knows where it is grounded', () => {
  const atlas = groundedLibrary();
  const graph = buildGraph(atlas);
  const tower = graph.nodes.find((n) => n.label === 'Timber tower');
  assert.deepEqual(new Set(tower.places), new Set(['denmark', 'europe']));
  atlas.close();
});

test('filtering by a region finds the work filed under a country inside it', () => {
  const atlas = groundedLibrary();
  const europe = buildGraph(atlas, { filterTags: ['europe'] });
  const titles = europe.nodes.filter((n) => n.type === 'source').map((n) => n.label).sort();
  assert.deepEqual(titles, ['Embodied carbon primer', 'Mass timber LCA', 'Timber tower']);
  atlas.close();
});
