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

One frame, 1920x1080: the title block in the clearing at the centre, the map around it,
and `The Atlas` with the three sections in a row beneath, joined into it by its own lines.
It is not a picture of the map, it is the map with the names taken off — the blots come
from `blobPath`, the function the canvas draws its tags with, gathered into islands the
way the islands gather. Pressing through is continuous rather than a jump to a different
idea.

It is ink only. The map earns its colour by being explorable — a wash there is a
territory you can open — and on a page you only look at, the same colour would be
decoration. The lines are bowed rather than straight, because a hand does not join two
points without leaning slightly one way, and the lean is seeded so the file is the same
every time it is drawn.

Nothing is hand-placed but the islands' anchors and the ground kept clear for the type.
Each island is a weight for its biggest blot and a tail of smaller ones, scattered on a
seed and rejected wherever they would touch another blot or the type; inside an island
every blot hangs off the nearest one already placed, and between islands the shortest
pair is bridged. The middle of the frame belongs to the words, and no
line may cross them: every join is walked as a curve and rejected if any point of it
lands on the title block or a button — a bowed line can miss a box at both ends and
still go straight through it. Bridges between islands take the shortest pair that keeps
clear rather than the shortest pair. The few lines that point *at* the type stop on its
edge, and one runs from the Atlas button to the section menu so the buttons read as part
of the constellation rather than as chrome dropped on top of it.

It is generated rather than hand-authored (`scripts/draw-hero.mjs`) so it stays editable
as intent: the file holds seven anchors, the weights of the blots each one carries, and
which islands are near enough to bridge. Move an anchor, run `npm run draw`, and the
island and every line that meets it follow — instead of path data nobody can adjust. Type is overlaid as real HTML on the same coordinates, sized in container-query
units so it scales with the drawing and stays on the lines that point at it. Below 48rem
the frame is too small to read type off, so the composition unstacks: type at ordinary
sizes, left-aligned in the gutter, with the drawing going behind it as ground — wider
than the screen so it runs off both edges. A drawing that small at the foot of the page
was a postage stamp of a map; behind the words it is the paper the page is printed on.
It is the same ink drawing it is on a wide screen rather than a faded one: the words
carry their own paper instead, as a halo — which is the trick the map already prints its
labels with, and it keeps one black drawing rather than two greys.

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

**And it settles before the first frame.** The corollary of fitting to a settled layout
is that an unsettled one has to be drawn somewhere, and somewhere was wherever the
camera was left — the origin at no zoom, which puts most of the constellation off the
top and left of the glass. Arriving at the map you watched it find its shape in the
corner for four and a half seconds and then watched the camera go and collect it. The
same four hundred steps run off screen cost a few milliseconds, and the first frame
drawn is the fitted one: on arrival the map is simply there, whole, the way a map on
paper is. The run is capped rather than run to rest, so an arrangement that will not
converge still yields to the page and the ordinary tick finishes it.

**One face on the map.** Everything written on the drawing is set in Tremplin — a tag's
name sized by the weight of its territory, a piece of research at the quiet end of the
same scale. Research used to be named in the serif the page sets its titles in, which
made the map two typographic worlds at once; weight alone is enough to tell a theme from
a thing filed under it, and one face reads as one drawing. The face arrives after the
first paint, so what was measured in whatever stood in for it is forgotten when it lands
and the map is drawn and reframed again — a name measured in a fallback is the wrong
width for the one that turns up, and the fit would have been framed to it.

**Each island is named, outside its own coastline.** A survey sheet names a region in
spaced capitals and the places inside it in roman, and that is exactly the distinction the
map needs: the theme a group of tags is about, against the tags themselves. The name comes
from the island's subjects rather than from whatever formats and methods happen to sit in
it — the heaviest theme tag, and the next one after it when the two still read as a name
rather than as a list ("Economics & Energy", "Ecology & Biodiversity", but "Carbon" on its
own, because "Carbon & Climate adaptation" is a list).

Where it goes is decided after every coastline is drawn, because it depends on the others:
six seats are tried — above the outline or below it, centred or pulled to either end — and
the emptiest wins, counting what it would cover of another island, of a name already
placed, and of whatever else is standing on the map (which is the same list the tag names
keep clear of). Nothing can guarantee a clear seat on a phone, where the islands are close
enough to touch; it can only take the best on offer. The boxes it used are then handed to
the label pass, so no tag's name is printed across its island's.

**The islands are drawn on ground of their own.** Each theme gets an outline round
its blots and a fill inside it, the way a survey sheet distinguishes formations it has
no colour left for. There are ten: rules at four angles, two crossings, a stipple, a
dotted rule, a dot-dash, and one that is a wide rule with a row of dots between. Every
distance in them is a multiple of the hatch spacing, so a texture keeps its texture at
any zoom. Which theme gets which is shuffled once on a fixed seed rather than taken in
order — neighbouring islands are numbered in sequence, and read off in sequence the
fills lay out in a visible progression — so the sheet looks like a sheet, while a theme
still keeps the same fill every time the page is opened. A fill is drawn straight onto
the canvas and clipped to the outline rather than built as a pattern, and only across
the box the outline occupies, which is what keeps a stipple to a few hundred dots
instead of a screenful. The boundary is
a coastline rather than a fence: gentle curves throughout, with no corner anywhere and
nothing that turns tightly.

Getting that took three things. It is the hull of *discs* rather than of points — the
blots ringed at arm's length — which is arcs joined by their common tangents and so has
no corner by construction, where the hull of the points themselves has one at every
vertex. Before the hull is taken, each blot is drawn in towards the middle of its theme
and given the same distance back as radius: the island keeps its reach, since the
outermost blot's far edge has not moved, but every turn the outline makes is now about
a third of the island across rather than as tight as whichever small tag happened to sit
on the edge. And it is built from the support function — how far the boundary stands
from the centre in each of ninety-six directions — then reassembled by intersecting
neighbouring tangents, which is what lets the hand's unevenness be added as a single
slow lean of the whole outline rather than as a jitter per corner. That matters more
than it sounds: a sway of frequency *k* takes (k² − 1) times its amplitude out of the
radius of curvature, so a fast wobble either flattens the outline or, past the budget
the rounding bought, turns it inside out into spikes. The lean is one term, capped at a
tenth of the roundness, and an outline that somehow still turned back on itself is
redrawn without it.

Every part of it is faint: the ground is the bottom layer of the
drawing and must never compete with the marks standing on it. It says what the layout
already says — these tags belong together — but says it at a glance, before a name is
read. It belongs to the islands only: inside an opened view you are looking at one
thing and its ties, not at territory, and the ground comes and goes on the same
dissolve the islands do.

What holds an island together is affinity — two tags pulled towards each other by the
research they share — and it is the strongest, shortest tie on the map, because a theme
has to read as one place from across the room. Cluster gravity is set high for tags for
the same reason.

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
across a room because every formation carries a colour.

The ink went to the line rather than the shape. Each blot is drawn round in it and
the wash laid inside, which is the order a sheet is actually made in — engraved
first, washed after — and it is what lets the drawing hold the map together while
the colour does the telling apart. Pointing at a blot or opening it lays that same
line in about three times heavier rather than adding anything around it, so the
shape is picked out by the hand that drew it.

The washes are a short family rather than a wheel: pinks from rose to plum, the
greens and olives of ground cover, blues from slate to indigo, the ochres a survey
sheet washes high ground with, and bone — eighteen in all. Mixed for cream paper
with ink over them, so none of them is bright. No orange anywhere, which is a rule
about hue and saturation together: an earth yellow that has gone that far round
stops reading as a wash and starts reading as a warning.

They are not all one weight, though, and that is the part that took two goes. A
family pitched at a single lightness is a family you cannot tell apart at blot
size — hue alone is not much to go on across a map, at a centimetre, in the corner
of your eye. So the family runs from bone at 84 down to deep green at 38, and
neighbours in the walk differ in weight as well as in hue: the fastest way to tell
two shapes apart is that one is pale and the other is not.

The family is stored in the order it is walked — a blue, a rose, a green, an ochre,
and round again — and a tag takes the next one by its place in the alphabet, so
consecutive shapes are never in the same register, let alone the same colour. An
earlier version stepped through the family by 1/φ, which is the right trick for a
continuous ramp and the wrong one for a short list: it landed three ochres in a row.

Eighteen washes and forty-odd tags means a colour comes round again, which is true
of a survey sheet as well — there are always more formations than there are washes.
It only costs you anything when both blots are on screen together, which is to say
on the same island, so an island's second claim on a wash steps on to the next free
one, seven along, which in a family arranged blue, rose, green, ochre is a different
register again. No island here holds more than seven tags, so there is always one
free. Without it, Dataset and Modelling — neighbours on the same island — came out
in the same indigo.

The dot that names a theme is ink. It was briefly one of the three primaries, which
it had to be while the blots themselves were black; now that every blot carries a
wash, ink is the one colour that reads on all of them, and a dot in a fourth colour
is one colour too many.

Type on a wash follows the wash. `needsPaper` in `js/ink.js` works out the
relative luminance of a colour and asks which of ink or paper actually reads
better on it, rather than guessing at where dark begins: a mid olive looks dark
and is not, and paper on it is worse than ink by half again. The record's title
bar, its blot, the sheet's grip and the tag chips all take their contrast from
that one answer, so the deep green opens a card with paper type and a pale slate
opens the same card in ink.

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

## A tap is not a drag

One pointer does three things on the map — open a mark, move a mark, move the camera —
so the map has to know which one is happening, and the answer is distance. A press is a
tap until it has travelled past a slop, and the slop depends on what is pressing: four
pixels for a mouse, ten for anything else, because a thumb lands on a wider spot than a
cursor and rolls as it lifts.

Nothing moves before that threshold is crossed, so a tap that wobbles leaves the map
exactly as it found it, and nothing opens after it has been: dragging a blot used to open
it as well, because the blot follows your finger and so is still under it when you let
go, which made every drag a tap and left you reading a record you had not asked for.
Panning is the same rule from the other side — a drag across the ground moves the camera,
a tap on it puts the map back — and the camera stops reframing itself the moment you
actually move it rather than the moment you touch the glass. The bottom sheet takes the
same allowance: at four pixels half the taps on it turned into little drags that went
nowhere.

A second finger is a fourth thing, and it ends whatever the first one was doing: a blot
half-dragged towards a pinch is not a drag, and the tap it would otherwise have counted
as is not a tap either. A pinch zooms about the point between the fingers and carries the
map along as that point moves, so how close you are and where you are are one gesture,
which is how a map is read by hand. The finger left on the glass when a pinch ends begins
nothing — it is the remains of a gesture already had. A trackpad pinch never arrives as
two pointers at all: the browser sends it as a wheel event holding ctrl, with a much
smaller delta, so it is scaled up to travel as far as the same gesture would.

## The top bar on a phone

The section row is the whole navigation on a wide screen and two wrapped lines of it on a
phone, taken out of the one screen the map has. So on a phone it stands down, and the bar
keeps one control: the Atlas' quatrefoil, solid, in the circle the section row draws round
it — a link to the landing page, where the three sections are laid out as buttons. Every
page carries it, so everywhere is two taps from everywhere: home, then the section.

It briefly had a menu as well — the sections dropped out of the bar from a button beside
the mark — and the mark briefly *was* that button. Both went. A mark that means *the
Atlas* on every other screen cannot also mean *open the menu* on this one; and once the
mark is a link home, the menu is a second way of doing what the landing page already does,
in the corner of the screen the map needs most.

## The tag bar

The row above the map is named — **Tags** — because a row of words with counts on them
is not self-evidently a filter, and it is one row, always. It shows the tags that fit
and tucks the rest behind **More**, which drops the whole vocabulary out of the bar as a
drawer. A filter bar that wraps to a second and third line as you pick tags moves the
map out from under itself every time, which is worse than not seeing all forty-seven at
once.

How many fit is measured rather than guessed, and measured against the row rather than
against the tag box — the box is about to be resized to whatever fits, so a box that
measures itself is answering the last question. What is left over falls between More and
the zoom controls, which is where the difference between filtering the library and
moving the camera actually is.

On a phone there is no room for a row of tags at all, so there isn't one: the bar is a
search field and a **Tags** button, and the same drawer opens under it as a menu the
width of the band. Picking a tag leaves it open, so you can pick a second; the map, the
Escape key, or the button closes it.

## Taking the reading away

A record is a reading list, and a reading list you cannot take with you is only a screen.
Each record carries one filled button — the only filled button on the map, because taking
the reading away is the thing you might not have known you could do — that writes out
exactly what the drawer is showing: the research listed in it, in the order it is listed.
Under a tag that is everything filed there; under a piece of research it is that piece
first and then the ones it sits beside, which is the list the drawer itself shows.

The button is also the one place the map has to ask a host for help. A page is not always
allowed to hand a file to whoever is reading it: inside the artifact viewer's sandbox an
ordinary download link does nothing at all. So the app looks for a hook a host may have
left for it, and the artifact build leaves one — the page asks, the viewer confirms, the
platform saves. Served from the repository there is no host and no hook, and the link is
used, which is all a page can do on its own.

Beside it is **Print**, which is the same record laid out for a page instead of a drawer:
A4 portrait with 15mm of margin all round, the research running as long as it runs, and
the themes cut at eight — which is where a row of them stops being a shelf mark and
starts being a second list. A citation never breaks across a page turn.

It began as a print stylesheet and `window.print()`, which is the right answer on a
laptop and no answer at all on a phone: inside an app's web view, or inside the sandbox a
published page runs in, the request to print is quietly ignored and nothing happens. A
file can always be handed over, so the button writes the PDF itself, and hands it to the
same place the bibliography goes.

`js/pdf.js` is that writer, and it is smaller than it sounds: a catalogue of objects, a
stream of text-positioning operators, and a table of byte offsets at the end. Two things
make it tractable. The fourteen fonts every reader already has need no embedding — so the
page is set in Times and Helvetica rather than in the Atlas' own faces, which is the one
thing lost in the trade. And those two have the same advance widths as the Arial and
Times New Roman on the machine drawing the page, so the browser can measure a line with
canvas and the reader will break it in exactly the same place. The tests check the file
the way a reader would: that every offset in the cross-reference table lands on its
object, that the page box is 210×297mm, and that the type sits 15mm in.

The text file is plain text, with the title, the citation line, the link and what each
piece is filed under. Plain text opens everywhere, survives every format after it, and can be pasted
into whatever a reader actually writes in — where a citation manager's format would have
to guess which one that is. The licence line the whole-library export carries comes with
it, since a few records taken out of the Atlas are on the same terms as all of them.
`/api/export.json` and `/api/export.bib` still take the library whole; this is the same
courtesy for the part you are looking at.

**Nothing animates while the window is being dragged.** The record is a card parked off
the right of the screen in one layout and a sheet parked under the bottom of it in the
other; they are the same element, so crossing the breakpoint changes which way it is
parked, and the transition that makes it slide in gracefully will just as gracefully play
that journey across the window — an animation of a drawer that is not open. The panel
drops its transition for as long as resize events keep arriving, and takes it back a sixth
of a second after they stop.

## Fitting the map on a phone

A map that does not fit is not a map, and the phone was the case where it did not.
Two things were keeping it small.

The first was the allowance for names. Labels are drawn at a fixed size in screen
pixels, so the room they need depends on the scale being solved for — which is
circular, and the old fit cut the knot with a flat reserve of up to fifty-eight
pixels a side. On a laptop that is breathing room; on a 390-pixel screen it is
nearly a third of the width, gone before a single blot is placed. `frameOf` now
measures: it fits the marks, measures the names at that scale, fits again, and
settles on the third pass. A name is capped at 140 pixels of influence, so one long
title is allowed to hang over the edge rather than pull the whole arrangement
smaller — past that the fit would be framing a line of type instead of a map.

The second was the shape of the archipelago. The cluster ring is squashed to the
frame it sits in, but the squash was capped at 1.5 — near enough square on a screen
that is nearly twice as tall as it is wide, so the fit was bound by width and left
the map floating in a band with empty paper above and below it. The cap is 2.2 now:
a phone gets a tall archipelago and fills its screen.

Zoom and recentre moved with it. In the scrolling row of filters they sat after
every tag, which on a phone meant they were found by accident or not at all. They
leave the row and stand on the map instead, bottom right where a thumb already is:
three round buttons, `fixed` rather than absolute so the row they are written
inside cannot scroll them away or clip them, riding above the drawer on the peek
height the sheet publishes and stepping aside altogether when the drawer is all the
way up and there is no map left to steer. Recentre keeps its word on a wide screen
and becomes a frame-and-dot mark on a narrow one, where the word would cost more
room than the map can spare. The label pass keeps clear of them, so no name is
printed underneath a button.

## Buttons

A button's name sits in the middle of its pill, and only its name: a tag's count and the
More button's caret are lifted out of the line and hung in space reserved for them at
both ends, so the word is centred on the shape rather than pushed off centre by the
number beside it. They are not part of the name — one is the tag's weight, the other says
the button opens something — and a row of pills whose words do not line up centrally
reads as sloppy long before a reader works out why.

Every button is an outline at rest and fills black when it is the one you are on or
pointing at — where pointing is something the device can actually do. A touchscreen
has no hover to leave, so `:hover` sticks there after a tap and leaves a button
looking switched on when it is nothing of the kind; the fill is `@media (hover:
hover)` for pointers and `:active` for thumbs. Nothing is filled by default, so the page has one ink weight and the filled
shape is always the answer to "where am I". One button breaks that rule on purpose: `The Atlas` on the landing page is filled at
rest, because it is the way in and the page should not need a second look to find it.
Pointing at it cannot fill it any further, so it breathes instead — a slow scale between
1.035 and 1.085, stopped outright under `prefers-reduced-motion`, where a breath held at
0.01ms is a flicker. The centring is done with `translate` so the pulse has `scale` to
itself and does not need to know how the button is placed.

Every other button's label is centred, and its ground is paper rather than nothing: a button with the drawing showing through it reads as a line
crossing a button rather than as a button. The connected nav paints that ground as a
fourth layer of its one shape — paper, then the per-item fills, then the outline, so the
stroke is never half-covered by a filled capsule.

Navigation goes further: a row of capsules whose outlines merge into a single continuous
curve, pinching inward through a concave fillet where two neighbours meet. It is real
geometry rather than a blur filter — for two end circles of radius r whose centres are d
apart, a fillet of radius R tangent to both sits at `k = sqrt((r + R)² − (d / 2)²)` off
the axis, and the outline alternates convex arcs with concave ones. `js/connected-nav.js`
measures the rendered items and draws the union outline behind them, so the curve is
exact at any width and in any typeface. Each item keeps its own border until that curve
is drawn, so with the script blocked the nav is still a row of buttons.

## About, and the Ask endpoint behind it

The fourth section of the site is **About**: a page of prose, which the rest of the site
is not. It says what the Atlas is — a landscape of regenerative research, submitted and
edited by the people who use it, curated by Malina Dabrowska — and then the three things
worth saying at length: why it is drawn rather than listed, that where a piece is filed is
the contribution and not a judgement a machine should be making on its own, and that the
whole library can be taken away. It is set at reading width in the display face, and it
ends on the ways in rather than on a signature, because an about page that does not put
you back into the thing is a dead end.

It replaced **Ask**, a page that put a question to the library in prose. The engine is
still there and still tested — `server/ask.js` and `POST /api/ask` — because it is a read
that costs nothing to keep and the API is part of the Atlas being easy to leave; what went
is the page in front of it. It works like this:

Ask is the library answering a question in prose, and it is deliberately not a chatbot:
there is no model in `server/ask.js` and nothing behind it but this database. A question
is read the way a librarian reads one. `interpret()` walks the sentence in phrases,
longest first, so "life cycle assessment" is one subject rather than three, and a word
swallowed by a tag is not searched again as loose text. Each phrase is put to the curated
vocabulary, and only a slug the library actually holds counts — `resolveTag` never comes
back empty (it slugifies whatever it is given), so a direct hit that names no tag here
must lose to the stemmed form, which is how "retrofitting" reaches Retrofit rather than
disappearing into the leftover words. The stem is crude on purpose — `-ies`, `-ing`,
`-ed`, `-es`, `-s`, with the doubled consonant undone — and it is only ever tried after
the word itself has failed, so it cannot take "building" apart into something the Atlas
does not mean.

What is left over after the tags is searched as text across title, authors, publisher,
summary and note. `rank()` weighs a named tag by its IDF and a loose word at 0.6, so a
question about `straw` is answered by the one source filed under it rather than the ten
filed under `measurement`. `speak()` then says what it understood and what it found, and
names what is missing: a subject the vocabulary knows but no source has claimed is called
out as a gap rather than quietly dropped, and a question the library cannot answer gets
told so. Every result carries its `why` — which tags it shares, which words it matched —
because an answer you cannot check is not an answer.

The endpoint is a read: `POST /api/ask` changes nothing and is rate-limited only so one
script cannot sit on it. It is also the one part of the site a static snapshot cannot
fake, which is part of why the page in front of it went.

## Where the library lives

Two copies, with one job each. SQLite is the working copy: every read the map makes is
synchronous — the fit measures every label, the drawing asks for nodes sixty times a
second — and a map that waits on a network for those is not a map you can drag. Supabase
is the durable copy: the place the research actually lives, which outlasts the machine
the server happens to be running on and can be read by anything else pointed at it.

So they are kept in step rather than swapped. The library is pulled down on boot, before
the door opens, so the first request is answered from the same shelf as the last one; a
new source is written to SQLite first — it is on the map immediately — and then written
through to the project, and the contributor is told plainly if that second write failed.
Losing the contribution because the network was out would be the worse trade.

It is `fetch` against PostgREST rather than a client library, because the install story
of this project is *clone it and run it* and a dependency that exists to save four lines
of `fetch` is a dependency to explain forever. With no credentials set, none of it runs
and the Atlas is exactly what it was: a SQLite file you can delete.

The tables are the SQLite ones, in Postgres. Row-level security makes the library public
to read and closed to write, so the anon key is safe to hand to a browser: writes go
through the server, which holds the service role key. And because the adapter cannot be
tested against the real project — that needs credentials nobody should commit — the tests
stand a small PostgREST up on a socket and check the shape of every request it is sent:
the upsert headers, the conflict targets, the paging, and that a tracking parameter is
off the URL key before a source is written, so the same paper twice is one row.

## What is deliberately missing

- **No accounts.** Anyone can add; nobody owns their entries. Rate limiting and the
  merge-on-duplicate rule stand in for moderation, and `status = 'hidden'` exists in
  the schema for when it does not.
- **No relevance ranking on the map.** Kin lines are symmetric and unranked. The map
  shows what is related, not what is important — that judgement stays with the reader.
  Ask does rank, because a question has an answer; it shows its working so the ranking
  can be argued with.
- **No automatic tagging.** The server *suggests* tags from a link's text, and only
  ever from the curated vocabulary, but a person decides. Where a piece sits is the
  contribution.
