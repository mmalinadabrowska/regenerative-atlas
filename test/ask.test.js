import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { ask, interpret, rank, speak } from '../server/ask.js';

/** A library small enough to reason about, with one deliberate gap. */
function library() {
  const atlas = openDatabase(':memory:');
  const add = (title, tags, extra = {}) =>
    atlas.addSource({
      url: `https://example.org/${title.replace(/\s+/g, '-')}`,
      title,
      tags,
      ...extra,
    });

  add('Embodied carbon primer', ['carbon', 'life-cycle-assessment', 'building'], {
    summary: 'A short introduction to embodied carbon in construction.',
  });
  add('Deep retrofit of a school', ['retrofit', 'carbon', 'case-study'], {
    summary: 'A 1960s school brought up to standard without demolition.',
  });
  add('Material passports', ['materials', 'reuse', 'circular-economy']);
  add('Soil and the city', ['soil', 'city', 'ecology']);
  return atlas;
}

const vocabularyOf = (atlas) => atlas.tagsWithCounts().filter((tag) => tag.count > 0);

test('a question names the tags it means, and keeps the rest as words', () => {
  const atlas = library();
  const { tags, terms } = interpret(
    'I am retrofitting a 1960s school and need embodied carbon numbers',
    vocabularyOf(atlas),
  );
  const slugs = tags.map((tag) => tag.slug);
  assert.ok(slugs.includes('retrofit'), 'retrofitting should reach the Retrofit tag');
  assert.ok(slugs.includes('carbon'));
  assert.ok(terms.includes('school'));
  assert.ok(!terms.includes('carbon'), 'a word taken by a tag is not searched again');
});

test('a phrase beats the words inside it', () => {
  const atlas = library();
  const { tags, terms } = interpret('life cycle assessment of timber', vocabularyOf(atlas));
  assert.deepEqual(tags.map((t) => t.slug), ['life-cycle-assessment']);
  assert.ok(!terms.includes('cycle'));
});

test('only tags the library actually holds are read into a question', () => {
  const atlas = library();
  const { tags, terms } = interpret('anything about governance', vocabularyOf(atlas));
  assert.deepEqual(tags, []);
  assert.ok(terms.includes('governance'));
});

test('a rare tag outranks a common one', () => {
  const atlas = library();
  const sources = atlas.listSources({ limit: 100 });
  const reading = interpret('retrofit and carbon', vocabularyOf(atlas));
  const found = rank(reading, sources, atlas.tagMap());
  assert.equal(found[0].source.title, 'Deep retrofit of a school');
});

test('loose words find a source through its own summary', () => {
  const atlas = library();
  const sources = atlas.listSources({ limit: 100 });
  const reading = interpret('demolition', vocabularyOf(atlas));
  const found = rank(reading, sources, atlas.tagMap());
  assert.equal(found.length, 1);
  assert.equal(found[0].source.title, 'Deep retrofit of a school');
});

test('nothing matching says so rather than reaching for the nearest thing', () => {
  const atlas = library();
  const answer = ask(atlas, 'aviation biofuel supply chains');
  assert.deepEqual(answer.found, []);
  assert.match(answer.said.join(' '), /Nothing in the library answers it/);
});

test('an empty question asks for a question', () => {
  const atlas = library();
  const answer = ask(atlas, '   ');
  assert.deepEqual(answer.found, []);
  assert.match(answer.said[0], /Tell me what you are exploring/);
});

test('a subject the library knows but nothing carries is named as missing', () => {
  const said = speak(
    { tags: [{ slug: 'soil', label: 'Soil' }, { slug: 'carbon', label: 'Carbon' }], terms: [] },
    [{ carried: ['carbon'] }],
    4,
  );
  assert.match(said.join(' '), /Nothing among them is filed under Soil/);
});

test('an answer says why each source is there', () => {
  const atlas = library();
  const answer = ask(atlas, 'embodied carbon in schools', { limit: 3 });
  assert.ok(answer.found.length > 0);
  for (const entry of answer.found) {
    assert.ok(entry.why.tags.length + entry.why.terms.length > 0);
    assert.ok(entry.score > 0);
  }
});
