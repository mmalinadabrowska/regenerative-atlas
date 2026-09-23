import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE_TAGS, aliasIndex, resolveTag, resolveTags, slugify, titleize } from '../server/vocabulary.js';

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

test('the alias index groups every written form under its canonical tag', () => {
  // The submission form uses this to show the tag you will actually get, so it
  // has to agree with resolveTag on every entry it publishes.
  const index = aliasIndex();
  let checked = 0;
  for (const [canonical, forms] of Object.entries(index)) {
    for (const written of forms) {
      assert.equal(
        resolveTag(written).slug,
        canonical,
        `${written} is indexed under ${canonical} but resolves elsewhere`,
      );
      checked++;
    }
  }
  assert.ok(checked > 100, 'the alias table should not have quietly emptied');
  assert.equal(index.economics.includes('doughnut-economics'), true);
});

test('titleize is only used where no curated label exists', () => {
  assert.equal(titleize('mass-timber-construction'), 'Mass timber construction');
});

/* --- places --------------------------------------------------------------- */

test('a place is a tag like any other, in its own facet', () => {
  assert.equal(resolveTag('Global').facet, 'location');
  assert.equal(resolveTag('Australia').slug, 'australia');
  assert.equal(resolveTag('New Zealand').facet, 'location');
});

test('written forms of a place fold onto the one the Atlas files it under', () => {
  for (const [written, expected] of [
    ['Scotland', 'uk'],
    ['United Kingdom', 'uk'],
    ['U.S.A.', 'usa'],
    ['Holland', 'netherlands'],
    ['Aotearoa', 'new-zealand'],
    ['worldwide', 'global'],
    ['European Union', 'europe'],
  ]) {
    assert.equal(resolveTag(written).slug, expected, written);
  }
});

test('a country the vocabulary does not name is folded to its region, not lost', () => {
  assert.equal(resolveTag('Ghana').slug, 'africa');
  assert.equal(resolveTag('Vietnam').slug, 'asia');
  assert.equal(resolveTag('Peru').slug, 'south-america');
});

test('a place brings its region with it, so asking for the region finds it', () => {
  assert.deepEqual(resolveTags(['Denmark']).map((t) => t.slug), ['denmark', 'europe']);
  assert.deepEqual(resolveTags(['Scotland']).map((t) => t.slug), ['uk', 'europe']);
  // A region on its own inherits nothing, and a region already named is not
  // added twice.
  assert.deepEqual(resolveTags(['europe']).map((t) => t.slug), ['europe']);
  assert.deepEqual(resolveTags(['uk', 'europe']).map((t) => t.slug), ['uk', 'europe']);
});

test('the region arrives after the tags the contributor actually chose', () => {
  assert.deepEqual(resolveTags(['Japan', 'carbon']).map((t) => t.slug), ['japan', 'carbon', 'asia']);
});

test('global is a place now, and the planetary scale kept its own name', () => {
  assert.equal(resolveTag('global').facet, 'location');
  assert.equal(resolveTag('planetary').facet, 'scale');
  assert.equal(resolveTag('planetary boundaries').slug, 'planetary');
});

test('every place that sits inside a region is a tag the vocabulary knows', () => {
  const slugs = new Set(CORE_TAGS.map((t) => t.slug));
  for (const tag of CORE_TAGS.filter((t) => t.facet === 'location')) {
    const [{ slug }] = resolveTags([tag.slug]);
    assert.equal(slug, tag.slug);
  }
  // Every region a country rolls up to has to exist, or the roll-up invents
  // vocabulary the index has never heard of.
  for (const tag of CORE_TAGS.filter((t) => t.facet === 'location')) {
    for (const { slug } of resolveTags([tag.slug])) assert.ok(slugs.has(slug), slug);
  }
});
