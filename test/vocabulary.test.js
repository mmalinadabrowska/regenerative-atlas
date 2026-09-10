import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE_TAGS, resolveTag, resolveTags, slugify, titleize } from '../server/vocabulary.js';

test('slugify flattens punctuation, case and accents', () => {
  assert.equal(slugify('  Circular Economy!  '), 'circular-economy');
  assert.equal(slugify('Écologie Régénérative'), 'ecologie-regenerative');
  assert.equal(slugify('Reuse & Repair'), 'reuse-and-repair');
  assert.equal(slugify("Nature's Patterns"), 'natures-patterns');
  assert.equal(slugify('   '), '');
  assert.equal(slugify(null), '');
});

test('aliases fold near-synonyms onto one canonical tag', () => {
  const canonical = ['circularity', 'Circular Economy', 'cradle to cradle', 'circular-design']
    .map((written) => resolveTag(written).slug);
  assert.deepEqual(new Set(canonical), new Set(['circular-economy']));

  assert.equal(resolveTag('LCA').slug, 'life-cycle-assessment');
  assert.equal(resolveTag('embodied carbon').slug, 'carbon');
  assert.equal(resolveTag('CLT').slug, 'timber');
  assert.equal(resolveTag('Regenerative Design').slug, 'regenerative-systems');
});

test('a tag nobody has curated is kept, in the open facet', () => {
  const coined = resolveTag('Mycorrhizal Networks');
  assert.equal(coined.slug, 'mycorrhizal-networks');
  assert.equal(coined.facet, 'open');
  assert.equal(coined.core, false);
  assert.equal(coined.label, 'Mycorrhizal networks');
});

test('resolveTags drops blanks and de-duplicates after canonicalisation', () => {
  const tags = resolveTags(['materials', '', 'Materials', 'circularity', 'circular economy', null]);
  assert.deepEqual(tags.map((t) => t.slug), ['materials', 'circular-economy']);
});

test('every curated tag has a facet and a distinct slug', () => {
  const slugs = new Set();
  for (const tag of CORE_TAGS) {
    assert.ok(tag.facet, `${tag.slug} has no facet`);
    assert.ok(tag.label, `${tag.slug} has no label`);
    assert.equal(slugs.has(tag.slug), false, `${tag.slug} is defined twice`);
    slugs.add(tag.slug);
  }
});

test('no alias target is itself missing from the core', () => {
  // Guards the pairing between the alias table and the curated list.
  for (const tag of CORE_TAGS) {
    assert.equal(resolveTag(tag.slug).slug, tag.slug, `${tag.slug} is aliased away from itself`);
  }
});

test('titleize is only used where no curated label exists', () => {
  assert.equal(titleize('mass-timber-construction'), 'Mass timber construction');
});
