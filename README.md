# Regenerative Atlas

An open-source, collective library of regenerative research — a bibliography anyone
can add to, a shared vocabulary that keeps it coherent, and a constellation map that
shows what sits near what.

Curated by Malina Dabrowska. Contributions welcome.

```
git clone https://github.com/mmalinadabrowska/regenerative-atlas.git
cd regenerative-atlas
npm run seed          # build data/atlas.db from the starter bibliography
npm start             # http://localhost:4321
```

There is no build step and no dependency tree — the whole platform is Node's standard
library plus the browser. `npm start` is the entire install story. Node 22.5 or newer
is required, for the built-in `node:sqlite`.

---

## The three parts

**A bibliography.** Paste a link on `/add`. The server goes and reads it — DOIs
through doi.org's citation API, everything else scraped for `citation_*`, Open Graph
and Dublin Core metadata — and hands back a filled-in form. You correct what it got
wrong and say where the piece sits. Submitting the same link twice does not make a
second entry; the two sets of tags are merged, because two people finding the same
paper is a signal rather than a collision.

**A tagging system.** Tags are free — anyone can coin one — but a curated core of
sixty holds the middle. Every tag written by a contributor is slugified and run
through an alias table before it is stored, so `Circular Economy`, `circularity` and
`cradle to cradle` all arrive at the same node instead of splitting the map three
ways. Tags carry a facet — theme, material, method, scale, format, or open — which
decides how hard they pull on the map. Themes hold territory; formats only tint it.

**A map.** `/map` draws the library as a constellation. Two kinds of node:

- **ink blobs** are sources, their shape derived from their id so a piece keeps the
  same body every time you visit;
- **stars** are tags.

Two kinds of line:

- **tagged** lines join a source to each tag it carries — the structure that pulls a
  source toward its territory;
- **kin** lines join source to source, drawn when two pieces share enough uncommon
  vocabulary to be worth reading together.

Kin lines are deliberately sparse. A graph that connects everything says nothing.

## How the clustering works

Clusters form on the **tags** first, by label propagation over their co-occurrence
graph, normalised by cosine so a tag like `materials` — which half the library carries
— cannot swallow everything it touches. Tag communities are more stable than source
communities and they name themselves, which matters on a map you have to read.

A source then joins the community its tags vote for, weighted by inverse document
frequency: a source tagged `mycelium` is placed by that, not by also being tagged
`materials`.

Kinship between two sources is the cosine of their IDF-weighted tag vectors. Cosine
rather than Jaccard on purpose — a thoroughly tagged source should not be punished for
the tags it does *not* share, and two pieces meeting on one uncommon tag should still
find each other. Each source keeps only its strongest few lines, and any source with
no line at all gets its single best candidate, so nothing well-tagged floats alone.

All of it is deterministic. The same library draws the same map.

## Layout

```
server/
  index.js        http server, router, static files
  api.js          request handlers, validation, JSON and BibTeX export
  db.js           SQLite schema and queries
  graph.js        clustering and the constellation payload
  metadata.js     reading a link, and the SSRF guard around doing so
  vocabulary.js   the curated tags and their aliases
  seed.js         loads data/seed.json
public/
  index.html      the three doors
  map.html        the constellation
  themes.html     keyword search and the vocabulary as an index
  add.html        submission
  js/ink.js       the drawing hand — every mark on the site comes from here
  js/constellation.js   force simulation and canvas renderer
scripts/
  check-links.js  walks every URL in the library and reports what has rotted
test/             63 tests, `npm test`
data/seed.json    the starter bibliography
```

## API

Everything the pages use is public and unauthenticated for reading.

| Method | Path | Does |
| --- | --- | --- |
| `GET` | `/api/sources?tag=&q=&limit=&offset=` | List sources; repeat or comma-separate `tag` to intersect |
| `GET` | `/api/graph?tag=&q=&tags=off` | The constellation: nodes, links, clusters |
| `GET` | `/api/tags` | Tags in use, with counts, grouped by facet |
| `GET` | `/api/vocabulary` | The curated core and its facets |
| `GET` | `/api/stats` | Counts and the five most recent additions |
| `GET` | `/api/export.json` | The whole library as JSON |
| `GET` | `/api/export.bib` | The whole library as BibTeX |
| `POST` | `/api/describe` | `{url}` → what that link says about itself |
| `POST` | `/api/sources` | `{url, title, tags[], …}` → adds a source |

Both `POST` routes are rate-limited per address. `POST /api/describe` makes the server
fetch a URL a stranger supplied, so it resolves the host first and refuses private,
loopback and link-local addresses.

## Adding to the library

Through the site is the intended way — `/add`, paste, check, tag.

To propose entries as a pull request instead, add them to `data/seed.json` and run
`npm run reset`. Please run `node scripts/check-links.js --seed` first: link rot is
what kills a bibliography, and a reference nobody can open is not a reference.

## The typeface

The design uses **Enby Gertrude** for display type. It is not redistributed here.
Drop `EnbyGertrude-Regular.woff2` (and/or `.woff`) into `public/fonts/` and it is
picked up automatically; without it the stack falls back to EB Garamond, then Hoefler
Text, then Georgia. Nothing breaks, it is just less itself.

## Deploying

Put it behind a reverse proxy and give it a persistent volume for `data/`.

```
PORT=4321 HOST=0.0.0.0 ATLAS_DB=/var/lib/atlas/atlas.db node server/index.js
```

`ATLAS_DB` sets the database path, `ATLAS_FETCH_TIMEOUT` the link-lookup timeout in
milliseconds. The database is a single SQLite file; back it up by copying it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), and [docs/design-notes.md](docs/design-notes.md)
for why the map looks the way it does.

## Licence

Code is MIT. Bibliographic records — titles, links, tags — are offered under CC0; the
works they point at remain with their authors.
