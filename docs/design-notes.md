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

**The orbit.** Inside an opened view, everything two hops out sits faintly on a ring
around the arrangement — the tags those sources also live under, the research those tags
also hold. It is drawn at a third of the ink, two thirds of the size, and stays unnamed
until you point at it. The point is to show that the map continues past this view without
competing with it: enough to tell you there is somewhere further to go, not enough to read
as part of what you opened. They are ranked by how much of the ring they hang off, so the
orbit is the places this neighbourhood actually leads, and spaced evenly around the circle
after being sorted by direction — near their parent without four of them piling onto the
same spot.

**Distance means something.** Nothing on a ring, fan or orbit sits at a uniform
radius. How far out a thing sits is how loosely it is tied to what you opened: on a
tag's ring, how much kinship it has with the others filed there; on a source's fan, how
many of its relatives share that tag, or how close the kinship runs; in the orbit, how
much of the ring it hangs off. A small seeded nudge on top keeps even an evenly tied
ring from drawing as a compass circle. The irregularity is not decoration — reading the
distance tells you something, which is the only reason to have it.

**The rearrangement takes three seconds.** Long, deliberately: it is the map turning
over, not a screen changing. The names dissolve before anything has moved far, stay gone
while it moves, and resolve once it has nearly settled — text sliding across the screen
is unreadable and makes movement feel like a fault, where text that clears and comes
back makes it feel like a thing being redrawn. The camera reframes continuously through
it, and clicking mid-flight retargets rather than waiting.

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

**A rearrangement is a dissolve, and the camera travels once.** Clicking swaps one
arrangement for another, and the first version of that swap cut: every connection in
the new view appeared in the frame you clicked in, which read as a different map
rather than as this one turning over. Now what is leaving fades out over the first
third, while everything is still near where you last saw it, and what is arriving
fades up over the last half, once the movement is nearly done — the marks that are in
both views carry the eye across in between. The names dissolve on the same principle
and a little ahead of it — all but one. The name you were pointing at when you
clicked stays printed the whole way through, and travels with its mark, so there is
one fixed thing to read while the rest of the map turns over. Pointing at a row in
the record card holds that name out on the map the same way.

The camera aims at the destination, never at the journey. Framing the arrangement
as it moved meant the outbound marks pushed the frame wide and then dragged it back
in — an over-bounce on every click. The frame is now computed from where the marks
are *going*, and the view is interpolated from where it started to there on the same
easing as the marks, so it moves once. Anything clipped on the way is fine; it is
where it settles that has to be right.

**The camera fits the layout, not the other way round.** The simulation runs at a
fixed scale in its own coordinate space; the view is then fitted to what it settles
into, with a floor on the zoom so marks never shrink into dust. Tying the layout to the
viewport makes the map collapse in a short window and drift in a tall one.

**Filtering narrows the map rather than highlighting within it.** Choosing `materials`
rebuilds the graph from those sources only, so clusters re-form around what is left.
You are looking at a smaller atlas, not the same atlas with most of it greyed out.

**On a phone the record is a sheet, not a wall.** The panel comes up from the bottom
showing only the title and the citation line — a preview two lines deep, clipped there
by hiding everything past the meta line rather than by letting the next paragraph run
off the edge half-read. Drag the grip up, or tap anywhere on the preview, and it climbs
to full height; drag it down, tap the grip, or shove it past the peek line and it goes
back or away. Pulled above its open position it stretches rather than travelling —
anchored to the bottom of the screen it can grow upwards without opening a gap under
itself — and the give is resisted and runs out, so the top of the record reads as the
top of the record rather than as somewhere left to go. A sheet that simply stops dead
under your finger reads as broken.

An open drawer stays open. Opening something else from the map, or from the record
you are reading, is a change of subject rather than a reason to put the drawer away
and start again, so the record swaps and the sheet keeps the height you left it at.
Opening a tag does clear the selected source, but the map no longer announces that
as a cleared selection: saying so told the page there was nothing to show, and the
page put the drawer away a frame before the tag's own record arrived.
The map reframes into whatever is left of it every time the sheet settles, so
what you opened stays on screen in the band above the drawer instead of sitting
behind it. Two things make that band usable: the controls are counted as cover, since
they float on a band of paper over the top of the canvas and the map does not begin
until they end; and in a band that shallow the orbit of second-order marks — the
widest thing on screen and the quietest — is left out of the framing, so what you
opened and what it is joined to get the room. The map is fitted to the strip above the peeking sheet, so opening
something still leaves you looking mostly at the map. Two details that took a rewrite:
the pointer is captured only once a gesture has really moved, because capturing on
pointerdown retargets the click that follows to the sheet and kills every link inside
it; and the drag is followed from the window, because the first few pixels of dragging
the sheet upwards take the finger off the sheet entirely.

## Colour

The Atlas was ink on paper for its first few weeks, which was right for the marks
and wrong for the map: forty-seven identical black blots are a field, not a
territory. The colour comes from Greenough's 1820 geological map of England and
Wales — a survey sheet is drawn in ink and coloured in washes, and it is legible
across a room because every formation has its own colour.

So every ink shape carries its own wash, and nothing else does. The ramp in
`js/ink.js` walks once around the wheel through that palette's family — slate
blue, sea green, sage, olive, ochre, terracotta, brick, dusty rose, mauve, moor
purple — mid-toned and unsaturated, because a pale wash disappears on this paper
and a saturated one stops being a wash. Lightness is corrected by hue so the
yellows land as ochre rather than as highlighter.

Shapes take their wash by index, stepped by 1/φ, so consecutive marks sit most of
a wheel apart: two blots that end up next to each other on the map, or two marks
that sit side by side in the drawing, can never be the same colour or close to
it. On the map the index is the tag's place in the alphabet — arbitrary, and
only there to give the ramp an order.

Everything that is not a tag stays ink: the sources, the lines between them, the
labels, the buttons, and the lines that join the landing drawing up. Colour means
one thing on this site, which is *this is a subject*.

## The record card

Opening something gives you a card laid on the map, not a wall built beside it:
outlined in ink, clear of every edge, with the map still running underneath.
The card is backed in its title bar's colour and the record paints paper over the
rest, rather than the other way round: backed in paper, the rounded corners left a
pale seam between the stroke and the colour wherever the browser composited the
sheet under a transform.

Its title bar is the piece that does the work — ink for a piece of research,
carrying its crosshair in paper; the tag's own colour for a tag, carrying the
tag's own blot. Whatever you opened, its colour is on screen twice, in the bar
and out on the map, so the two are plainly about the same thing.

Under it: what the record is, one action, and then its relations. A source lists
what it is **tagged** with — chips in the same washes the blots wear — and its
**research threads**, each named by what it shares with this one. A tag lists the
**research threads** filed under it and the **connected tags** its research is
also filed under, the strongest dozen. A research row is the same row in both
places, mark and all: it is the same thing being listed, and the mark is how you
find it on the map — which only holds if the mark on the map is the same mark. A
piece of research is a crosshair in a circle wherever it appears, and the one you
have open carries a second ring outside its own. The glyph has a floor of seven
pixels, because below that a stroked mark closes up into a dot.

The card draws its own scrollbar rather than borrowing one: a hairline down the
edge of the record with a single ink dot at your place in it. Every browser draws
its native bar differently, a phone draws a slab over the content, and the parts
that can be styled cannot be styled everywhere — one drawn mark is the same
everywhere and never in the way. Asking a touch browser for a scrollbar colour is
worse than leaving it alone: it swaps its overlay bar for one that takes a column
of the page, and that column came out of the map as a strip of bare paper down the
side of everything. The card is the only thing that scrolls — lists that
scrolled inside it put a second scrollbar against the first, and nested scrollers
are a trap for a wheel and worse for a thumb.

Running down a list points at the map. The row's crosshair fills with ink and
its cross goes to paper, and the same piece of research does exactly that out on
the map — the list and the drawing are one instrument. Pointing at a shape
directly, or opening it, draws it round in ink: an outline on the blot itself
rather than a halo around it, so it reads as that blot picked out rather than as
a second mark.

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
