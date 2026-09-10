# Contributing

## Adding research

The Atlas is meant to be added to by people, through the site: go to `/add`, paste a
link, check what the server read back, and tag it.

Two things make a record worth having:

- **Tag it across facets.** A source tagged only `materials` sits nowhere in
  particular. One tagged `straw`, `bio-based`, `case-study`, `neighbourhood` finds its
  neighbours immediately. Three to six tags is the useful range.
- **Fill in "why it matters".** It is optional and it is the most valuable field in
  the record. The summary says what a text contains; your note says why someone
  should read it.

Coin a new tag when the vocabulary genuinely lacks one. If a curated tag nearly fits,
use it — near-synonyms are folded automatically, and a map with two words for one idea
is a worse map. New tags land in the `open` facet; if one earns its place it can be
promoted into `server/vocabulary.js` with a facet and a note.

## Working on the code

```
npm install     # nothing to install, but it keeps npm quiet
npm test        # 63 tests, no network needed
npm run dev     # node --watch
npm run reset   # rebuild data/atlas.db from data/seed.json
npm run check-links
```

House rules:

- **No dependencies.** Not a purity thing — it is so that a designer can clone this
  and have it running in thirty seconds, on a laptop, in five years. If something
  genuinely needs a package, say why in the pull request.
- **No build step.** The browser gets the files as written. ES modules, plain CSS.
- **Everything a contributor sends is untrusted.** Clamp it, canonicalise it, and
  escape it before it reaches `innerHTML` (`escapeHtml` in `public/js/api.js`).
- **The map must stay deterministic.** No `Math.random()` in layout or drawing — seed
  from the node's id, as `ink.js` does. A map that reshuffles on reload cannot be
  learned.

## Testing

`npm test` runs everything against in-memory databases and an ephemeral HTTP server,
with no network access, so it works offline and in CI.

Tests worth adding with a change:

- new vocabulary or aliases → `test/vocabulary.test.js`
- anything touching clustering or kinship → `test/graph.test.js`, which asserts on
  what *should* end up near what rather than on exact coordinates
- new endpoints or validation → `test/api.test.js` and `test/http.test.js`

The canvas is not unit-tested. Check it by looking at it.
