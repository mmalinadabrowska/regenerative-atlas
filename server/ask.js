/**
 * Ask: a question put to the library in prose, answered from the library alone.
 *
 * There is no model here and no web behind it. A question is read the way a
 * librarian reads one — the words that carry meaning, and which of them name
 * something the Atlas already has a word for — and then the shelves are
 * searched. The honesty of that is the point: an answer can only ever be what
 * somebody has added, and where the library has nothing the reply says so
 * rather than inventing a plausible source.
 */

import { resolveTag } from './vocabulary.js';
import { idfWeights } from './graph.js';

/** Words that carry no subject. Kept short: a stoplist is not a vocabulary. */
const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'any', 'anything', 'are', 'around',
  'as', 'at', 'be', 'been', 'being', 'best', 'better', 'between', 'both', 'but', 'by', 'can',
  'could', 'describe', 'did', 'do', 'does', 'doing', 'each', 'especially', 'exploring', 'few',
  'find', 'finding', 'for', 'from', 'get', 'give', 'good', 'had', 'has', 'have', 'help', 'her',
  'here', 'his', 'how', 'i', 'if', 'in', 'interested', 'into', 'is', 'it', 'its', 'just', 'know',
  'like', 'looking', 'lot', 'made', 'make', 'many', 'me', 'might', 'more', 'most', 'much', 'my',
  'need', 'new', 'no', 'not', 'of', 'on', 'one', 'or', 'other', 'our', 'out', 'over', 'particular',
  'really', 'research', 'see', 'should', 'show', 'so', 'some', 'something', 'such', 'than',
  'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things', 'think',
  'this', 'those', 'through', 'to', 'up', 'us', 'use', 'used', 'using', 'very', 'want', 'was',
  'we', 'well', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with', 'within',
  'without', 'work', 'working', 'would', 'you', 'your',
]);

const words = (text) =>
  String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}'-]+/u)
    .map((word) => word.replace(/^['-]+|['-]+$/g, ''))
    .filter(Boolean);

/**
 * A crude stem, so "materials" finds "material" and "retrofitting" "retrofit".
 * It is only ever tried after the word itself has failed to name anything, so
 * it cannot take "building" apart into something the Atlas does not mean.
 */
const stem = (word) => {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith('ing')) return undouble(word.slice(0, -3));
  if (word.length > 4 && word.endsWith('ed')) return undouble(word.slice(0, -2));
  if (word.length > 3 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
};

/** "retrofitt" is not a word; "retrofit" is. */
const undouble = (word) =>
  word.length > 3 && !'aeiou'.includes(word.at(-1)) && word.at(-1) === word.at(-2)
    ? word.slice(0, -1)
    : word;

/**
 * Read a question: the tags it names, and the words left over.
 *
 * Phrases are tried longest first, so "life cycle assessment" is one subject
 * rather than three, and a word swallowed by a tag is not searched again as
 * loose text.
 */
export function interpret(question, vocabulary = []) {
  const known = new Map(vocabulary.map((tag) => [tag.slug, tag]));
  const tokens = words(question);
  const taken = new Set();
  const tags = [];

  for (let size = 4; size >= 1; size--) {
    for (let i = 0; i + size <= tokens.length; i++) {
      if (Array.from({ length: size }, (_, k) => i + k).some((k) => taken.has(k))) continue;
      const phrase = tokens.slice(i, i + size).join(' ');
      const stemmed = tokens.slice(i, i + size).map(stem).join(' ');
      // resolveTag never returns nothing — an unknown phrase comes back as its
      // own slug — so the word itself only wins when the library actually holds
      // that tag, and the stem gets its turn when it does not.
      const slug = [phrase, stemmed]
        .map((candidate) => resolveTag(candidate)?.slug)
        .find((found) => found && known.has(found));
      if (!slug || tags.some((t) => t.slug === slug)) continue;
      tags.push({ ...known.get(slug), named: phrase });
      for (let k = i; k < i + size; k++) taken.add(k);
    }
  }

  const terms = [];
  tokens.forEach((token, i) => {
    if (taken.has(i) || STOPWORDS.has(token) || token.length < 3) return;
    if (!terms.includes(token)) terms.push(token);
  });

  return { tags, terms };
}

/** Everything a source says about itself, as one lowercase haystack. */
const haystack = (source) =>
  [source.title, source.authors, source.publisher, source.summary, source.note]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/**
 * Score the library against a reading of the question.
 *
 * A named tag is worth more than a loose word, and a rare tag more than a
 * common one: a question about `straw` is answered better by the one source
 * filed under it than by the ten filed under `measurement`.
 */
export function rank({ tags, terms }, sources, tagsOf, { limit = 8 } = {}) {
  const idf = idfWeights(tagsOf, sources.length || 1);
  const wanted = new Set(tags.map((tag) => tag.slug));
  const stems = terms.map(stem);

  const scored = sources.map((source) => {
    const carried = (tagsOf.get(source.id) ?? []).filter((slug) => wanted.has(slug));
    const tagScore = carried.reduce((sum, slug) => sum + (idf.get(slug) ?? 1), 0);

    const text = haystack(source);
    const hits = terms.filter((term, i) => text.includes(term) || text.includes(stems[i]));
    const textScore = hits.length * 0.6;

    return { source, carried, hits, score: tagScore + textScore };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.carried.length - a.carried.length ||
        (b.source.year ?? 0) - (a.source.year ?? 0),
    )
    .slice(0, limit);
}

const list = (items, join = 'and') =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} ${join} ${items[items.length - 1]}`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Say what was understood and what was found, in sentences. The reply never
 * claims more than the shelves hold: what is missing is named as missing.
 */
export function speak({ tags, terms }, found, total) {
  const said = [];

  if (tags.length) {
    said.push(`Reading that as ${list(tags.map((tag) => tag.label))}.`);
  } else if (terms.length) {
    said.push(`Nothing in that names a subject the Atlas has a word for yet, so I have read it as ${list(terms.map((term) => `“${term}”`))}.`);
  } else {
    return ['Tell me what you are exploring and what you would like to find, in a sentence or two.'];
  }

  if (found.length === 0) {
    said.push(
      `Nothing in the library answers it — there are ${plural(total, 'source')} here so far, and none of them touch this. That is worth knowing: it is a gap you could fill.`,
    );
    return said;
  }

  said.push(
    found.length === 1
      ? 'One piece here speaks to it.'
      : `${plural(found.length, 'piece')} here speak to it, strongest first.`,
  );

  // Which of the named subjects nothing found actually carries.
  const carried = new Set(found.flatMap((entry) => entry.carried));
  const absent = tags.filter((tag) => !carried.has(tag.slug));
  if (absent.length) {
    said.push(
      `Nothing among them is filed under ${list(absent.map((tag) => tag.label))} — the Atlas knows the word, but no source here has claimed it.`,
    );
  }

  return said;
}

/**
 * The whole answer: what was read, what was found, and why each one is here.
 */
export function ask(atlas, question, { limit = 8 } = {}) {
  const asked = String(question ?? '').trim();
  const vocabulary = atlas.tagsWithCounts().filter((tag) => tag.count > 0);
  const reading = interpret(asked, vocabulary);
  const sources = atlas.listSources({ limit: 1000 });
  const tagsOf = atlas.tagMap();
  const found = asked ? rank(reading, sources, tagsOf, { limit }) : [];

  return {
    question: asked,
    reading: {
      tags: reading.tags.map(({ slug, label, facet, count }) => ({ slug, label, facet, count })),
      terms: reading.terms,
    },
    said: speak(reading, found, sources.length),
    found: found.map(({ source, carried, hits, score }) => ({
      ...source,
      why: { tags: carried, terms: hits },
      score: Math.round(score * 100) / 100,
    })),
  };
}
