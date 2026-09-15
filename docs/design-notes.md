# Design notes

## The references

Two, held together.

**Obsidian's graph view** is the interaction model: a force-directed map you can pan,
zoom and interrogate, where hovering a node dims everything it is not connected to.
It is good at answering *what is near this?* — which is the question a researcher
actually has.

**Joan Miró's constellations** are the visual language. Miró's marks are uneven,
weighted, alive: black bodies of varying heft, small plotted marks, thin lines that connect
without explaining, a very occasional primary colour. That is a far better register
for a library of research than the even circles of a network diagram, because it says
these are things somebody chose, not rows returned from a query.

The whole site draws from one module, `public/js/ink.js`, so the landing page marks and
the map nodes are made by the same hand.

## The landing page

One frame, 1920x1080: the title block in the clearing at the centre, marks scattered
around it, and thin lines running between them to `The Atlas` sitting under the biggest
star, with the three sections in a row beneath. It is the map in miniature — the same
grammar of blobs, marks and connecting lines — so that pressing through is continuous
with what you find behind it rather than a jump to a different idea. One of the drawing's
lines runs from the Atlas button down to the section menu, so the buttons read as part of
the constellation rather than as chrome dropped on top of it.

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

**Tags are ink, research is a plotted point.** The heavy marks belong to the tags,
because the tags are what organise the map — and a tag's blot grows with the number of
sources filed under it, so the hierarchy of the library is legible as weight before you
read a single word. Research is a circled cross: small, near-uniform, deliberately plain.
The thing being indexed should not outshout the index. Each blob's shape comes from a
hash of its id, so a tag keeps its silhouette between visits and becomes recognisable.

This is the second arrangement. The first had it the other way round — sources as blobs,
tags as asterisks — which drew the eye to the individual paper and left the territories
unreadable. Inverting it made the map answer *what is this region about* before *what is
this particular thing*, which is the question you have first.

**The map is three views, not one picture.** Opening the page gives you the tags
alone, clustered into islands by what they are filed alongside, drifting a few pixels
each on their own slow period so the thing is alive without moving far enough to make
you chase it. Open a tag and the graph rearranges: that tag at the centre, everything
filed under it on a ring, and the kinship between those pieces drawn. Open one of those
pieces and it rearranges again — the piece in the middle, its tags fanned to one side,
the research it sits beside fanned to the other. Click the empty ground and you are back
on the islands.

Each view gets the arrangement that suits it rather than one global simulation for all
three. A ring is the most legible shape there is for *these belong to that*: no crossings,
even spacing, an unmistakable centre. The fan came second — the source view first used
two concentric rings, which put the tags inside the relatives and made every line cross
every other. Splitting it left and right means reading the picture and reading the
sentence are the same act. Only the islands are simulated, because only they are asking
a question about the whole library at once; the opened views are composed, and stay put.

**Detail arrives with the zoom.** Fully out, the map names only the tags that carry
enough of the library to orient by, and no titles at all. Coming closer lowers the bar on
tags and lets more of each title through, in three steps. The thresholds are expressed
relative to the zoom that fits the whole map rather than as absolute zoom levels, so the
behaviour holds as the library grows: thirty sources and three thousand both open as
territory and reveal titles at the same point in the gesture. Line weight stops following
the zoom past a point, too — past it the lines stop being connections and start being the
picture.

Because the research marks are small by design, they are given a minimum hit target of
about sixteen pixels regardless of zoom. Small to read is not the same as small to hit.

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

## Buttons

Every button is an outline at rest and fills black when it is the one you are on or
pointing at. Nothing is filled by default, so the page has one ink weight and the filled
shape is always the answer to "where am I".

Navigation goes further: a row of capsules whose outlines merge into a single continuous
curve, pinching inward through a concave fillet where two neighbours meet. It is real
geometry rather than a blur filter — for two end circles of radius r whose centres are d
apart, a fillet of radius R tangent to both sits at `k = sqrt((r + R)² − (d / 2)²)` off
the axis, and the outline alternates convex arcs with concave ones. `js/connected-nav.js`
measures the rendered items and draws the union outline behind them, so the curve is
exact at any width and in any typeface. Each item keeps its own border until that curve
is drawn, so with the script blocked the nav is still a row of buttons.

## What is deliberately missing

- **No accounts.** Anyone can add; nobody owns their entries. Rate limiting and the
  merge-on-duplicate rule stand in for moderation, and `status = 'hidden'` exists in
  the schema for when it does not.
- **No relevance ranking.** Kin lines are symmetric and unranked. The map shows what
  is related, not what is important — that judgement stays with the reader.
- **No automatic tagging.** The server *suggests* tags from a link's text, and only
  ever from the curated vocabulary, but a person decides. Where a piece sits is the
  contribution.
