# Design notes

## The references

Two, held together.

**Obsidian's graph view** is the interaction model: a force-directed map you can pan,
zoom and interrogate, where hovering a node dims everything it is not connected to.
It is good at answering *what is near this?* — which is the question a researcher
actually has.

**Joan Miró's constellations** are the visual language. Miró's marks are uneven,
weighted, alive: black bodies of varying heft, asterisk stars, thin lines that connect
without explaining, a very occasional primary colour. That is a far better register
for a library of research than the even circles of a network diagram, because it says
these are things somebody chose, not rows returned from a query.

The whole site draws from one module, `public/js/ink.js`, so the landing page marks and
the map nodes are made by the same hand.

## The landing page

One frame, 1920x1080: the title block in the clearing at the centre, marks scattered
around it, and thin lines running between them to a black `The Map` label sitting under
the biggest star. It is the map in miniature — the same grammar of blobs, stars and
connecting lines — so that pressing the label is continuous with what you find behind it
rather than a jump to a different idea.

The marks are brush strokes: a centreline whose width varies along its length, filled as
an outline rather than stroked. A pen has a nib and the nib turns, so the line swells
where the hand pressed and thins where it lifted; that one property is most of what
separates a drawn mark from a plotted one. Closed centrelines come back as hollow rings,
which is where the blob shapes come from.

They are generated rather than hand-authored (`scripts/draw-hero.mjs`) so they stay
editable as geometry — points and widths — instead of freezing into path data nobody can
adjust. Type is overlaid as real HTML on the same coordinates, sized in container-query
units so it scales with the drawing and stays on the lines that point at it. Below 48rem
the frame is too small to read type off, so the composition unstacks: type at ordinary
sizes first, the drawing kept underneath as a coda.

## Decisions worth knowing about

**Sources are blobs, tags are stars.** A source is a thing — it has weight and a body.
A tag is an idea — it radiates. The blob's shape comes from a hash of the node's id,
so a source keeps its silhouette between visits and becomes recognisable.

**Colour is almost absent.** Ink on unbleached paper, with Miró's red, blue and yellow
used only as a small accent on the tag that names each cluster. Clusters are told apart
by position and by their named hubs, not by a colour key nobody can hold in their head.

**Lines bow slightly.** A straight line reads as a diagram; a line with a little give
in it reads as drawn. The bow is derived from the endpoints, so it never shimmers
between frames.

**Labels are dropped rather than overlapped.** Every frame, labels are queued by
importance — the selected node first, then its neighbours, then tags by how many
sources carry them — and any label that would collide with one already placed is
skipped until you zoom in. A constellation with every name printed over every other
name is unreadable, and a map that hides some names is more honest than one that
prints them all illegibly.

**The camera fits the layout, not the other way round.** The simulation runs at a
fixed scale in its own coordinate space; the view is then fitted to what it settles
into, with a floor on the zoom so marks never shrink into dust. Tying the layout to the
viewport makes the map collapse in a short window and drift in a tall one.

**Filtering narrows the map rather than highlighting within it.** Choosing `materials`
rebuilds the graph from those sources only, so clusters re-form around what is left.
You are looking at a smaller atlas, not the same atlas with most of it greyed out.

## What is deliberately missing

- **No accounts.** Anyone can add; nobody owns their entries. Rate limiting and the
  merge-on-duplicate rule stand in for moderation, and `status = 'hidden'` exists in
  the schema for when it does not.
- **No relevance ranking.** Kin lines are symmetric and unranked. The map shows what
  is related, not what is important — that judgement stays with the reader.
- **No automatic tagging.** The server *suggests* tags from a link's text, and only
  ever from the curated vocabulary, but a person decides. Where a piece sits is the
  contribution.
