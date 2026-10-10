/** Wiring for /map: state in the URL, graph from the API, drawing in constellation.js. */

import { api, citationLine, escapeHtml, fillCount, hostOf, usingSnapshot } from './api.js';
import { createConstellation } from './constellation.js';
import { CROSSHAIR, WHEN, blotMark, createDrawer, hand, printGraph } from './drawer.js';
import { librarianGlyph } from './glyph.js';
import { needsPaper } from './ink.js';
import { A4, Sheet, toBlob } from './pdf.js';

const canvas = document.getElementById('constellation');
const zoomCluster = document.querySelector('.map-zoom');
const searchInput = document.getElementById('panel-search');
const searchOpen = document.getElementById('map-search-open');
const shareButton = document.getElementById('panel-share');
const said = document.getElementById('panel-said');
const filterBox = document.getElementById('map-filters');
const clearButton = document.getElementById('map-clear');
const moreButton = document.getElementById('map-more');
const drawer = document.getElementById('tag-drawer');
const drawerList = document.getElementById('tag-drawer-list');
const placeBox = document.getElementById('map-places');
const placeMoreButton = document.getElementById('map-place-more');
const placeDrawer = document.getElementById('place-drawer');
const placeDrawerList = document.getElementById('place-drawer-list');
const formatButton = document.getElementById('map-format-more');
const formatName = document.getElementById('map-format-name');
const formatShort = document.getElementById('map-format-short');
const formatDrawer = document.getElementById('format-drawer');
const formatDrawerList = document.getElementById('format-drawer-list');
const resetButton = document.getElementById('map-reset');
const zoomInButton = document.getElementById('map-in');
const zoomOutButton = document.getElementById('map-out');
const legend = document.getElementById('map-legend');
const emptyState = document.getElementById('map-empty');
const emptyClear = document.getElementById('map-empty-clear');
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panel-body');
const panelGlyph = document.getElementById('panel-glyph');
const panelTitle = document.getElementById('panel-title');

const state = {
  tags: new Set(),
  query: '',
  graph: null,
};

const map = createConstellation(canvas, {
  onSelect: showRecord,
  onFocus: (node) => {
    if (node?.type === 'tag') showTag(node);
    renderLegend(state.graph, node);
    // The address follows what is open, so the link in the bar is always the
    // view on the screen rather than the one you started from.
    writeUrl();
  },
  // The filter row floats over the canvas on wide screens; node names should
  // not be printed underneath it.
  // The record panel covers the right of the canvas; the map is fitted to what
  // is left rather than to the whole frame.
  inset() {
    const canvasBox = canvas.getBoundingClientRect();
    // The controls float on a band of paper over the top of the canvas, so the
    // map does not begin until they end. On a wide screen there is enough room
    // for this not to matter; in the strip left above an open drawer it is the
    // difference between the arrangement being on screen and being under the
    // search field.
    const controls = controlsRow.getBoundingClientRect();
    const gap = { top: Math.max(controls.bottom - canvasBox.top, 0) };

    if (!panel.classList.contains('is-open')) return gap;
    const panelBox = panel.getBoundingClientRect();
    if (panelBox.left >= canvasBox.right) return gap;
    // On a narrow screen the panel rises from the bottom across the full width;
    // on a wide one it sits against the right edge. Which one it is has to be
    // read from where it actually is, not from where it starts vertically —
    // the desktop panel is inset from the top too.
    const fullWidth = panelBox.left <= canvasBox.left + 2;
    if (!fullWidth) return { ...gap, right: Math.max(canvasBox.right - panelBox.left, 0) };
    // Whatever the sheet covers is not map either. Framed against a
    // preview-sized sheet, an open drawer would sit over the very thing you
    // opened.
    return { ...gap, bottom: Math.max(canvasBox.bottom - panelBox.top, 0) };
  },
  avoid() {
    const canvasBox = canvas.getBoundingClientRect();
    const keepClear = [];

    const controls = chrome.getBoundingClientRect();
    if (controls.bottom > canvasBox.top) {
      keepClear.push({
        x: 0,
        y: 0,
        w: canvasBox.width,
        h: Math.max(controls.bottom - canvasBox.top + 6, 0),
      });
    }

    // Names should not print under the floating zoom cluster either. On a wide
    // screen it is `display: contents` and has no box at all, so an empty rect
    // is the same question as "is this a phone".
    const zoomBox = zoomCluster.getBoundingClientRect();
    if (zoomBox.height > 0) {
      keepClear.push({
        x: zoomBox.left - canvasBox.left - 8,
        y: zoomBox.top - canvasBox.top - 8,
        w: zoomBox.width + 16,
        h: zoomBox.height + 16,
      });
    }

    const librarianBox = document.querySelector('.librarian-call')?.getBoundingClientRect();
    if (librarianBox?.height > 0) {
      keepClear.push({
        x: librarianBox.left - canvasBox.left - 8,
        y: librarianBox.top - canvasBox.top - 8,
        w: librarianBox.width + 16,
        h: librarianBox.height + 16,
      });
    }

    const legendBox = legend.getBoundingClientRect();
    if (legendBox.height > 0) {
      keepClear.push({
        x: legendBox.left - canvasBox.left - 8,
        y: legendBox.top - canvasBox.top - 8,
        w: legendBox.width + 16,
        h: legendBox.height + 16,
      });
    }

    return keepClear;
  },
});

/**
 * The card starts under the controls, wherever they end. The filter row wraps
 * to a second line on a narrow window and grows as tags are added to it, so
 * where it ends is measured rather than assumed.
 */
const controlsRow = filterBox.closest('.map-controls');
const chrome = filterBox.closest('.map-chrome');

function placePanel() {
  const shell = canvas.parentElement;
  const top = controlsRow.getBoundingClientRect().bottom - shell.getBoundingClientRect().top;
  panel.style.setProperty('--panel-top', `${Math.max(Math.round(top + 12), 12)}px`);
}

if (window.ResizeObserver) {
  new ResizeObserver(placePanel).observe(controlsRow);
  // How many tags fit is a question about the width of the row, so it is asked
  // of the row. Asking it of the tag box instead was a question that answered
  // itself: tucking pins that box to the width its chips used, so widening the
  // window never changed it, the observer never fired again, and the tags that
  // had been tucked away stayed away. The row is the thing that follows the
  // window; its own width is not something tucking touches.
  new ResizeObserver(tuckTags).observe(controlsRow);
}
window.addEventListener('resize', placePanel);
placePanel();

/* --- state in the address bar, so a view of the map is shareable --------- */

function readUrl() {
  const params = new URLSearchParams(location.search);
  state.tags = new Set(params.getAll('tag').flatMap((t) => t.split(',')).filter(Boolean));
  state.query = params.get('q') ?? '';
  searchInput.value = state.query;
  // Opened once the library it names has arrived, which is why it is kept here
  // rather than acted on now.
  state.arriveAt = params.get('open') ?? null;
}

/**
 * The address, kept as the map is read.
 *
 * Filters were always in it; what is open is too, so that the address in the
 * bar is the view on the screen — the theme or the record whose drawer you are
 * reading, and not only the library it was narrowed from. That is what makes
 * the link worth sending.
 */
function writeUrl() {
  const params = new URLSearchParams();
  for (const tag of state.tags) params.append('tag', tag);
  if (state.query) params.set('q', state.query);
  const open = map.opened?.()?.id;
  if (open) params.set('open', open);
  const search = params.toString();
  history.replaceState(null, '', search ? `?${search}` : location.pathname);
}

function toggleTag(slug) {
  if (state.tags.has(slug)) {
    state.tags.delete(slug);
    return;
  }
  // One format at a time: a work is a paper or a report, and asking for both
  // at once would find nothing. Choosing another replaces the one chosen.
  if (isFormat(slug)) for (const other of formats) state.tags.delete(other.slug);
  state.tags.add(slug);
}

const isFormat = (slug) => formats.some((t) => t.slug === slug);

/* --- loading ------------------------------------------------------------ */

let inFlight = 0;

async function load() {
  writeUrl();
  const ticket = ++inFlight;
  const params = {};
  if (state.tags.size) params.tag = [...state.tags].join(',');
  if (state.query) params.q = state.query;

  try {
    const graph = await api.graph(params);
    if (ticket !== inFlight) return;
    state.graph = graph;
    map.setGraph(graph);
    renderLegend(graph, map.opened?.());
    // Awaited, because what arrives on a shared link is opened just below, and
    // its drawer names places by the labels this loads — opened before them, a
    // record read "uk, europe" where it means "UK".
    await renderFilters();
    // Said only when the map has nothing left to show. A filter that still
    // leaves islands standing has found something, whatever else it lost, and
    // a message over a drawn map contradicts the map. And only ever about a
    // search: an Atlas with nothing in it yet is a different situation with a
    // different answer, and this is not it.
    emptyState.hidden = !(
      graph.nodes.length === 0 && (state.tags.size > 0 || Boolean(state.query))
    );
    // The open search is a reading of this graph, so it is re-read with it.
    renderSearchResults();

    // Somebody arriving on a shared link lands where the sender was standing.
    // Once only: after that the map is theirs to move.
    if (state.arriveAt) {
      const going = state.arriveAt;
      state.arriveAt = null;
      map.open(going);
    }
  } catch (error) {
    legend.innerHTML = `<b>The map could not be drawn.</b> ${escapeHtml(error.message)}`;
  }
}

/* --- chrome ------------------------------------------------------------- */

let vocabulary = [];
// Every place a record can be grounded in, countries included, for naming them;
// and the few the map is filtered by — the continents and Global.
let grounds = [];
let places = [];
// What kind of work each is — paper, report, toolkit. Filtered on, never drawn.
let formats = [];

const tagChip = (tag) => `<button class="tag" type="button" data-tag="${escapeHtml(tag.slug)}"
        aria-pressed="${state.tags.has(tag.slug)}">${escapeHtml(tag.label)}
        <span class="tag__count">${tag.count}</span></button>`;

/**
 * The heaviest lead, and whatever you have picked is pulled to the front of the
 * row so a filter you are using is never the one that got tucked away.
 */
function leading(list, depth) {
  const lead = list.slice(0, depth);
  const chosen = [...state.tags].filter(
    (slug) => list.some((t) => t.slug === slug) && !lead.some((t) => t.slug === slug),
  );
  return [...chosen.map((slug) => list.find((t) => t.slug === slug)), ...lead];
}

async function renderFilters() {
  if (vocabulary.length === 0 && places.length === 0) {
    const { tags } = await api.tags();
    // Places are filtered on in the same way and drawn on the map in no way at
    // all, so they leave the vocabulary here and keep their own row.
    vocabulary = tags.filter((t) => t.facet !== 'location' && t.facet !== 'format');
    formats = tags.filter((t) => t.facet === 'format');
    // Filtered on by continent, and Global: a country is what a record says
    // about itself, in its drawer, and inside its continent here — a row of
    // two hundred places is not a filter anybody can read.
    grounds = tags.filter((t) => t.facet === 'location');
    places = grounds.filter((t) => !t.within);
  }

  filterBox.innerHTML = leading(vocabulary, 18).map(tagChip).join('');
  drawerList.innerHTML = vocabulary.map(tagChip).join('');
  placeBox.innerHTML = leading(places, 8).map(tagChip).join('');
  placeDrawerList.innerHTML = places.map(tagChip).join('');
  formatDrawerList.innerHTML = formats.map(tagChip).join('');
  formatButton.hidden = formats.length === 0;
  formatButton.previousElementSibling.hidden = formats.length === 0;
  const format = formats.find((t) => state.tags.has(t.slug));
  formatName.textContent = format?.label ?? 'Any';
  formatShort.textContent = format?.label ?? 'Format';
  formatButton.classList.toggle('is-set', Boolean(format));
  // Before the row is measured: Clear takes room in it, and a row measured
  // without it clips the last chip of each group once it arrives.
  clearButton.hidden = state.tags.size === 0 && !state.query;
  tuckTags();
}

/**
 * Keep the filter bar to one line. Everything past the end of the row is hidden
 * rather than wrapped: a bar that grows downwards as you pick tags moves the
 * map out from under itself every time. What is hidden is not lost — the whole
 * vocabulary is a button away, in the drawer.
 *
 * Two groups share the row now, and they are not equals. The places are few
 * and each one stands for a great deal of the library, so they are served
 * first, up to about a third of the row; the tags take everything left. Served
 * the other way round a wide vocabulary would push the whole location group
 * behind its More button, and a filter nobody can see is a filter nobody uses.
 */
const PLACE_SHARE = 0.34;

function tuckTags() {
  const boxes = [placeBox, filterBox];
  for (const box of boxes) {
    for (const chip of box.children) chip.hidden = false;
    // Collapsed to nothing first, so the row is not overflowing while it is
    // measured: an overflowing row has already squeezed the search field, and
    // the room left for tags would be read off a width that only exists while
    // there is no room. The tags keep their own width through this.
    box.style.flexBasis = '0px';
  }
  if (filterBox.offsetParent === null) return;

  // How much room the groups have is asked of the row, not of either box: a
  // box is about to be resized to whatever fits, and a box that measures
  // itself measures the answer to the last question rather than this one.
  const rowGap = parseFloat(getComputedStyle(controlsRow).columnGap) || 0;
  const standing = [...controlsRow.children].flatMap((child) =>
    getComputedStyle(child).display === 'contents' ? [...child.children] : [child],
  );
  let taken = 0;
  for (const item of standing) {
    if (boxes.includes(item)) continue;
    const width = item.getBoundingClientRect().width;
    if (width > 0) taken += width + rowGap;
  }

  const room = Math.max(controlsRow.clientWidth - taken - rowGap, 0);
  // A third of the row, or whatever the first two places need if that is more:
  // one chip under a heading reads as a mistake rather than as a group, and
  // the whole point of the row is that you can see there is a choice.
  const forPlaces = fill(
    placeBox,
    Math.min(room * 0.5, Math.max(room * PLACE_SHARE, widthOf(placeBox, 2))),
  );
  fill(filterBox, room - forPlaces);
}

/**
 * What the first `count` chips in a box would take, gaps included.
 *
 * Measured in real widths rather than in `offsetWidth`, which is rounded to
 * whole pixels — and rounded *down* as often as not. A box sized from those
 * roundings comes out a fraction of a pixel short of its own contents, and
 * since it clips what it cannot hold, the shortfall lands on the last chip:
 * the right-hand curve of its capsule shaved flat against whatever stands
 * next to it. A third of a pixel is all it takes to see.
 */
const widthOfChip = (chip) => chip.getBoundingClientRect().width;

function widthOf(box, count) {
  const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
  return [...box.children]
    .slice(0, count)
    .reduce((total, chip) => total + widthOfChip(chip) + gap, -gap);
}

/**
 * Show what fits in `room` and hide the rest, then give the box back the width
 * it actually used — so More stands at the end of the chips rather than across
 * a gap from them. Returns that width.
 */
function fill(box, room) {
  const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
  let used = 0;
  let full = false;
  for (const chip of box.children) {
    const width = widthOfChip(chip);
    if (full || used + width > room) {
      full = true;
      chip.hidden = true;
      continue;
    }
    used += width + gap;
  }
  // Rounded up, never down: a box a hair narrower than what is in it clips the
  // last chip, and the whole point of hiding what does not fit is that nothing
  // is ever shown cut in half.
  const width = Math.ceil(Math.max(used - gap, 0));
  box.style.flexBasis = `${width}px`;
  return width ? width + gap : 0;
}

/* --- the drawers ---------------------------------------------------------- */

/**
 * A button and the panel it drops out of. Two of them now — the rest of the
 * vocabulary, and everywhere the library is grounded — and only ever one open:
 * they hang from the same row and would otherwise stack down over the map.
 */
function hangDrawer(button, panel) {
  const shown = () => !panel.hidden;
  const show = (open) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const opening = !shown();
    for (const other of drawers) other.show(false);
    show(opening);
  });

  // Anywhere else is a way out of it — including the map, which is the thing
  // the drawer is standing in front of.
  document.addEventListener('pointerdown', (event) => {
    if (!shown()) return;
    if (event.target === button || panel.contains(event.target) || button.contains(event.target)) return;
    show(false);
  });

  return { shown, show };
}

const drawers = [];
drawers.push(
  hangDrawer(moreButton, drawer),
  hangDrawer(placeMoreButton, placeDrawer),
  hangDrawer(formatButton, formatDrawer),
);

/** True while any drawer is down; closing them all is what Escape does first. */
const drawerOpen = () => drawers.some((d) => d.shown());
const closeDrawers = () => drawers.forEach((d) => d.show(false));

const plural = (n, word) => `<b>${n}</b> ${word}${n === 1 ? '' : 's'}`;

/**
 * The way out with everything. It stands above the count rather than in it
 * because it is the one line under the map that is an offer rather than a
 * description, and it is the only part of the legend a phone keeps: the
 * sentence explaining what an island is has no room there, and taking the
 * library with you should not depend on the size of the glass.
 *
 * A static copy of the Atlas has no endpoint to serve it, so it says nothing.
 * Asked at the moment the legend is written rather than when this file is
 * read: served from a folder rather than from the Atlas, the fall back to the
 * baked library only happens once the first request has failed.
 */
const exportLink = () =>
  usingSnapshot()
    ? ''
    : '<a class="map-legend__export" href="/api/export.json" download>Export the library</a>';

function renderLegend(graph, opened = map.opened?.()) {
  if (!graph) return;
  const { sources, tags } = graph.stats;

  if (opened) {
    const what =
      opened.type === 'tag'
        ? `${plural(opened.count ?? 0, 'source')} filed under <b>${escapeHtml(opened.label)}</b>`
        : `<b>${escapeHtml(opened.label)}</b> — what it is filed under, and what it sits beside`;
    legend.innerHTML = `
      ${exportLink()}
      <span class="map-legend__text">
        ${what}<br>
        <span style="opacity:.75">Open anything else to travel on.
        Click the empty ground to come back to the islands.</span>
      </span>`;
    return;
  }

  legend.innerHTML = `
    ${exportLink()}
    <span class="map-legend__text">
      ${plural(tags, 'theme')} across ${plural(sources, 'source')}.<br>
      <span style="opacity:.75">This map is a landscape of regenerative research.
      Each island is a theme — click to see what it holds.</span>
    </span>`;
}

/* --- the record panel --------------------------------------------------- */

/**
 * The head is the panel's identity: a piece of research is ink, a tag is the
 * colour it is drawn in on the map. Whichever it is, the same colour is on
 * screen twice — in the head and under your cursor — so the panel and the map
 * are plainly about the same thing.
 */
function setHead(kind, title, glyph, wash) {
  panel.dataset.kind = kind;
  panel.style.setProperty('--head', wash || 'var(--ink)');
  // Most tags are drawn in ink now, so the title bar cannot assume it is dark
  // type on a wash: what is written on it follows the colour underneath it.
  panel.style.setProperty('--head-ink', needsPaper(wash) ? 'var(--paper)' : 'var(--ink)');
  panelGlyph.innerHTML = glyph;
  panelTitle.textContent = title;
}

const washOfTag = (slug) => map.washOf(`t:${slug}`);

const tagChips = (slugs) =>
  `<div class="tag-cloud">${slugs
    .map((slug) => {
      const wash = washOfTag(slug);
      const style = wash
        ? ` style="--chip: ${wash}; --chip-ink: ${needsPaper(wash) ? 'var(--paper)' : 'var(--ink)'}"`
        : '';
      // Travel, not filter. A tag named inside a record is a place on the map
      // you have not been to yet, and the thing to do with it is go there —
      // the map moves to that island and redraws itself around it, which is
      // what clicking the island would have done. Narrowing the whole library
      // is a different intention, and it has its own button above.
      return `<button class="tag tag--wash" type="button" data-travel="${escapeHtml(
        slug,
      )}"${style}>${escapeHtml(labelOf(slug))}</button>`;
    })
    .join('')}</div>`;

/**
 * One row of the research list: the mark, the name, and what it is to you. The
 * row is the same wherever research is listed — under a tag it is named by its
 * citation, under another piece of research by what the two share — because it
 * is the same thing being listed, and the mark is how you find it on the map.
 */
/**
 * Where a piece of research is grounded, said the way a person would say it.
 *
 * A record carries the region with the country — that is what makes asking for
 * Europe find the work filed under Denmark — so filed on it are both. Naming
 * both on one line reads as a hierarchy nobody asked to see, so the region is
 * dropped wherever somewhere inside it is already named: "UK", not "UK,
 * Europe". A record grounded in two countries of the same region keeps both.
 */
function groundedIn(node) {
  const slugs = node.places ?? [];
  if (slugs.length === 0) return '';
  const implied = new Set(slugs.map((slug) => placeWithin(slug)).filter(Boolean));
  const named = slugs.filter((slug) => !implied.has(slug));
  return (named.length ? named : slugs).map((slug) => labelOf(slug)).join(', ');
}

const placeWithin = (slug) => grounds.find((p) => p.slug === slug)?.within ?? null;

/**
 * One row of the research list: the mark, the name, and what it is to you. The
 * row is the same wherever research is listed — under a tag it is named by its
 * citation, under another piece of research by what the two share — because it
 * is the same thing being listed, and the mark is how you find it on the map.
 *
 * Where it is grounded comes last and in its own ink: a fact about the work
 * rather than part of its citation, and the one thing on the row you can scan
 * a list by.
 */
const threadRow = (node, under) => {
  const ground = groundedIn(node);
  return `<li><a href="#" data-open="${escapeHtml(node.id)}">
    ${CROSSHAIR}
    <span class="thread__name">${escapeHtml(node.label)}
      <small>${under}${
        ground ? `<span class="thread__place">${escapeHtml(ground)}</span>` : ''
      }</small></span></a></li>`;
};

/* --- taking the reading away ---------------------------------------------
   A record is a reading list, and a reading list you cannot take with you is
   only a screen. The button writes out exactly what the drawer is showing —
   the research listed in it, in the order it is listed — as plain text,
   because plain text opens everywhere and outlives every format after it. */

/** What the drawer is showing, kept so the download writes out the same thing. */
let shown = null;

const DOWNLOAD = `<button class="label label--small label--filled" type="button" data-download>Download bibliography</button>`;

const PRINT = `<button class="label label--small" type="button" data-print>Print</button>`;

/** One entry: what it is, who made it, where to find it, how it is filed. */
function entry(source, index) {
  const lines = [`${index}. ${source.label}`];
  const cited = citationLine(source);
  if (cited) lines.push(`   ${cited}`);
  if (source.url) lines.push(`   ${source.url}`);
  const tags = (source.tags ?? []).map(labelOf);
  if (tags.length) lines.push(`   Filed under: ${tags.join(', ')}`);
  return lines.join('\n');
}

function bibliography() {
  if (!shown) return '';
  const { kind, node, sources } = shown;
  const heading =
    kind === 'tag'
      ? [
          `Regenerative Atlas — ${node.label}`,
          `${sources.length} ${sources.length === 1 ? 'piece' : 'pieces'} of research filed under this tag.`,
        ]
      : [
          `Regenerative Atlas — ${node.label}`,
          sources.length > 1
            ? `This piece of research, and the ${sources.length - 1} it sits beside on the map.`
            : 'This piece of research.',
        ];

  return [
    ...heading,
    `Taken from the map on ${WHEN()}.`,
    '',
    sources.map((source, i) => entry(source, i + 1)).join('\n\n'),
    '',
    '—',
    'Bibliographic records from the Regenerative Atlas are shared under CC0;',
    'the linked works remain with their authors.',
    '',
  ].join('\n');
}

const fileNameOf = (label) =>
  `regenerative-atlas-${String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'reading'}.txt`;

/* --- the same record, on paper -------------------------------------------
   A4 portrait with 15mm of margin, which is what a printer here has in it and
   what a PDF is expected to open as. It is written rather than printed: asking
   the browser to print is the right answer on a laptop and no answer at all on
   a phone, where an app's web view — or the sandbox a published page runs in —
   ignores the request and nothing happens at all. A file can always be handed
   over, so a file is what this makes. See js/pdf.js for how.

   The list runs as long as the research does; the themes stop at eight, which
   is where a row of them stops being a shelf mark and starts being a second
   list. */

const MAX_THEMES = 8;

function printRecord() {
  if (!shown) return;
  const { kind, node, sources, themes = [], places: grounded = [] } = shown;
  const shelf = themes.slice(0, MAX_THEMES).map(labelOf);
  const rest = Math.max(themes.length - shelf.length, 0);
  const listed = kind === 'tag' ? sources : sources.slice(1);

  const sheet = new Sheet({ size: A4 });

  sheet.text(
    kind === 'tag' ? 'A THEME IN THE REGENERATIVE ATLAS' : 'RESEARCH IN THE REGENERATIVE ATLAS',
    { size: 7.5, grey: 0.4 },
  );
  sheet.space(3);
  sheet.text(node.label, { font: 'serif', size: 22, leading: 1.15 });
  if (kind === 'source') {
    const cited = citationLine(node);
    if (cited) sheet.text(cited, { size: 9.5, grey: 0.2 });
    if (node.url) sheet.text(node.url, { size: 8.5, grey: 0.45 });
  }
  sheet.rule({ gap: 6 });
  sheet.space(8);

  for (const passage of [node.note, node.summary].filter(Boolean)) {
    sheet.text(passage, { font: 'serif', size: 11, leading: 1.5, grey: 0.1 });
    sheet.space(8);
  }

  printGraph(sheet, map.trace?.());

  if (shelf.length) {
    sheet.text(kind === 'tag' ? 'CONNECTED THEMES' : 'FILED UNDER', { size: 7.5, grey: 0.4 });
    sheet.rule({ grey: 0.75, gap: 2 });
    sheet.space(5);
    sheet.text(shelf.join('  ·  ') + (rest ? `   and ${rest} more` : ''), { size: 10 });
    sheet.space(10);
  }

  if (grounded.length) {
    sheet.text('GROUNDED IN', { size: 7.5, grey: 0.4 });
    sheet.rule({ grey: 0.75, gap: 2 });
    sheet.space(5);
    sheet.text(grounded.map(labelOf).join('  ·  '), { size: 10 });
    sheet.space(10);
  }

  if (listed.length) {
    const heading =
      kind === 'tag'
        ? `RESEARCH FILED UNDER ${node.label.toUpperCase()} (${listed.length})`
        : `RESEARCH IT SITS BESIDE (${listed.length})`;
    sheet.text(heading, { size: 7.5, grey: 0.4 });
    sheet.rule({ grey: 0.75, gap: 2 });
    sheet.space(6);

    listed.forEach((source, index) => {
      // A citation broken over a page turn is two half-citations.
      sheet.reserve(34);
      sheet.text(`${index + 1}.  ${source.label ?? source.title ?? ''}`, { size: 11 });
      const cited = citationLine(source);
      if (cited) sheet.text(cited, { size: 9, grey: 0.25, indent: 14 });
      if (source.url) sheet.text(source.url, { size: 8.5, grey: 0.45, indent: 14 });
      sheet.space(7);
    });
  }

  sheet.space(6);
  sheet.rule({ gap: 2 });
  sheet.space(4);
  const where = /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(location.hostname)
    ? ''
    : `  ·  ${location.host}`;
  sheet.text(`Taken from the Regenerative Atlas on ${WHEN()}${where}`, { size: 7.5, grey: 0.4 });
  sheet.text(
    'Bibliographic records are shared under CC0; the linked works remain with their authors.',
    { size: 7.5, grey: 0.4 },
  );

  hand(fileNameOf(node.label).replace(/\.txt$/, '.pdf'), toBlob(sheet));
}

function downloadBibliography() {
  const text = bibliography();
  if (!text) return;
  hand(fileNameOf(shown.node.label), text);
}

function showTag(node) {
  const sources = (state.graph?.links ?? [])
    .filter((l) => l.kind === 'tagged' && (l.source === node.id || l.target === node.id))
    .map((l) => state.graph.nodes.find((n) => n.id === (l.source === node.id ? l.target : l.source)))
    .filter((n) => n?.type === 'source')
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.label.localeCompare(b.label));

  // What else the research under this tag is filed under — the threads leading
  // out of this island, counted so the strongest ones come first.
  const alongside = new Map();
  for (const source of sources) {
    for (const slug of source.tags ?? []) {
      if (slug !== node.slug) alongside.set(slug, (alongside.get(slug) ?? 0) + 1);
    }
  }
  const connected = [...alongside.entries()]
    .sort((a, b) => b[1] - a[1] || labelOf(a[0]).localeCompare(labelOf(b[0])))
    .slice(0, 12)
    .map(([slug]) => slug);

  setHead('tag', node.label, blotMark(node.id), washOfTag(node.slug));
  shown = { kind: 'tag', node, sources, themes: connected };
  panelBody.innerHTML = `
    ${node.note ? `<p class="panel__summary">${escapeHtml(node.note)}</p>` : ''}
    <p class="panel__actions">
      <button class="label label--small" type="button" data-tag="${escapeHtml(node.slug)}">Filter the library to this</button>
      ${sources.length ? DOWNLOAD : ''}
      ${sources.length ? PRINT : ''}
    </p>
    <h4>Research threads</h4>
    <ul class="panel__links">${sources
      .map((source) =>
        threadRow(source, escapeHtml(citationLine(source) || hostOf(source.url))),
      )
      .join('')}</ul>
    ${connected.length ? `<h4>Connected tags</h4>${tagChips(connected)}` : ''}`;
  openPanel();
}

/**
 * The drawer, as a search.
 *
 * Not a third kind of thing with a place of its own: the Atlas' answers all
 * arrive in the same drawer, and a search is one more answer. The field sits
 * where the title would be, because when a search is what is open, what you
 * are typing is what it is about.
 *
 * What is listed is what the map is already showing — typing filters the map
 * as it always did, and this is that same result read as a list. So the two
 * never disagree, and a row you point at lights up out there.
 */
function showSearch() {
  setHead('search', '', '', null);
  renderSearchResults();
  openPanel();
  if (isSheet()) setSheet('open');
  // Without preventScroll the browser scrolls whatever holds the field until the
  // field is in view — and on a phone, with the sheet still sliding up, that is
  // the map's own frame: it was scrolled 412px, taking the drawer's head off the
  // top of the screen with it. The sheet brings the field into view by itself.
  searchInput.focus({ preventScroll: true });
  searchOpen.setAttribute('aria-expanded', 'true');
  shown = { kind: 'search' };
}

function renderSearchResults() {
  if (panel.dataset.kind !== 'search') return;
  const query = state.query.trim().toLowerCase();
  if (!query) {
    panelBody.innerHTML = `<p class="panel__meta">Type to search the library — the research in it,
      and the themes it is filed under.</p>`;
    return;
  }

  const nodes = state.graph?.nodes ?? [];
  // Everything the map is showing, because the drawer is a reading of the map
  // and a reading that leaves things out is a different map. So: every theme
  // still standing out there, not only the ones whose names happen to contain
  // what was typed — the rest are what this research is filed under, which is
  // the answer as much as the name is. What you typed leads, and behind it the
  // company it keeps, heaviest first.
  const sources = nodes.filter((n) => n.type === 'source');
  const themes = nodes
    .filter((n) => n.type === 'tag')
    .sort((a, b) => {
      const named = (t) => (t.label.toLowerCase().includes(query) ? 0 : 1);
      return named(a) - named(b) || (b.weight ?? 0) - (a.weight ?? 0) || a.label.localeCompare(b.label);
    });

  if (themes.length === 0 && sources.length === 0) {
    panelBody.innerHTML = `<p class="panel__meta">Nothing in the library matches
      “${escapeHtml(state.query.trim())}”.</p>`;
    return;
  }

  panelBody.innerHTML = `
    ${themes.length ? `<h4>Themes</h4>${tagChips(themes.map((t) => t.slug))}` : ''}
    ${
      sources.length
        ? `<h4>Research</h4>
           <ul class="panel__links">${sources
             .map((source) =>
               threadRow(source, escapeHtml(citationLine(source) || hostOf(source.url))),
             )
             .join('')}</ul>`
        : ''
    }`;
}

function showRecord(node) {
  if (!node) {
    closePanel();
    return;
  }
  const related = (state.graph?.links ?? [])
    .filter((l) => l.kind === 'kin' && (l.source === node.id || l.target === node.id))
    .map((l) => {
      const otherId = l.source === node.id ? l.target : l.source;
      const other = state.graph.nodes.find((n) => n.id === otherId);
      return other ? { other, shared: l.shared ?? [] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, 6);

  setHead('source', node.label, CROSSHAIR, null);
  // The record itself leads the reading list it is the middle of.
  shown = {
    kind: 'source',
    node,
    sources: [node, ...related.map(({ other }) => other)],
    themes: node.tags ?? [],
    places: node.places ?? [],
  };
  panelBody.innerHTML = `
    <p class="panel__meta">${escapeHtml(citationLine(node)) || escapeHtml(hostOf(node.url))}</p>
    ${node.summary ? `<p class="panel__summary">${escapeHtml(node.summary)}</p>` : ''}
    ${node.note ? `<p class="record__note">${escapeHtml(node.note)}</p>` : ''}
    <p class="panel__actions">
      <a class="label label--small" href="${escapeHtml(node.url)}" target="_blank" rel="noopener noreferrer">Read the source ↗</a>
      ${DOWNLOAD}
      ${PRINT}
    </p>
    <h4>Tagged</h4>
    ${tagChips(node.tags ?? [])}
    ${(node.formats ?? []).length ? `<h4>Format</h4>${tagChips(node.formats)}` : ''}
    ${
      (node.places ?? []).length
        ? `<h4>Grounded in</h4>${tagChips(node.places)}`
        : ''
    }
    ${
      related.length
        ? `<h4>Research threads</h4>
           <ul class="panel__links">${related
             .map(({ other, shared }) =>
               threadRow(
                 other,
                 `shares ${shared.map((slug) => escapeHtml(labelOf(slug))).join(', ') || 'related vocabulary'}`,
               ),
             )
             .join('')}</ul>`
        : ''
    }
    ${node.contributor ? `<h4>Added by</h4><p class="panel__meta">${escapeHtml(node.contributor)}</p>` : ''}`;
  openPanel();
}

const labelOf = (slug) =>
  vocabulary.find((t) => t.slug === slug)?.label ??
  grounds.find((t) => t.slug === slug)?.label ??
  formats.find((t) => t.slug === slug)?.label ??
  state.graph?.nodes.find((n) => n.slug === slug)?.label ??
  slug;

/* --- the panel, which on a phone is a bottom sheet ----------------------- */

const sheetDrawer = createDrawer({
  panel,
  head: document.getElementById('panel-head'),
  body: panelBody,
  grip: document.getElementById('sheet-grip'),
  rail: document.getElementById('scroll-rail'),
  railDot: document.getElementById('scroll-dot'),
  map,
  onClose: () => searchOpen.setAttribute('aria-expanded', 'false'),
});
const { isSheet, setSheet } = sheetDrawer;
const openPanel = () => sheetDrawer.open();
const closePanel = () => sheetDrawer.close();

/* Running down the list points at the map: the row's mark fills in, and so does
   the same piece of research out on the map. */

const pointAt = (event) => {
  const row = event.target.closest?.('[data-open]');
  if (row) return map.highlight(row.dataset.open);
  // A theme named in a list is a place on the map too, and pointing at it
  // should light up the island it stands for — the same as pointing at a piece
  // of research lights up its mark.
  const chip = event.target.closest?.('[data-travel]');
  map.highlight(chip ? `t:${chip.dataset.travel}` : null);
};

panelBody.addEventListener('pointerover', pointAt);
panelBody.addEventListener('focusin', pointAt);
panelBody.addEventListener('pointerleave', () => map.highlight(null));
panelBody.addEventListener('focusout', () => map.highlight(null));

/* --- events ------------------------------------------------------------- */

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-download]')) {
    event.preventDefault();
    downloadBibliography();
    return;
  }
  if (event.target.closest('[data-print]')) {
    event.preventDefault();
    printRecord();
    return;
  }
  const travelChip = event.target.closest('[data-travel]');
  if (travelChip) {
    event.preventDefault();
    const slug = travelChip.dataset.travel;
    // Places are filed on records rather than drawn as islands, so there is
    // nowhere to travel to; narrowing the library to one is the nearest thing
    // to what was asked for, and is what the filter bar would have done.
    if (!map.open(`t:${slug}`)) {
      toggleTag(slug);
      load();
    }
    return;
  }

  const tagButton = event.target.closest('[data-tag]');
  if (tagButton) {
    event.preventDefault();
    toggleTag(tagButton.dataset.tag);
    // The format menu is a menu: choosing from it is done with it.
    if (formatDrawer.contains(tagButton)) closeDrawers();
    load();
    return;
  }
  const openLink = event.target.closest('[data-open]');
  if (openLink) {
    event.preventDefault();
    map.open(openLink.dataset.open);
  }
});

document.getElementById('panel-close').addEventListener('click', () => {
  closePanel();
  map.reset();
});

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = searchInput.value.trim();
    load();
  }, 260);
});

// The button opens the search, and closes it again if it is what is open —
// the same press, the same drawer.
searchOpen.addEventListener('click', () => {
  if (panel.dataset.kind === 'search' && panel.classList.contains('is-open')) {
    closePanel();
    return;
  }
  showSearch();
});

/** Back to the whole library: every filter dropped and the search emptied. */
function clearFilters() {
  state.tags.clear();
  state.query = '';
  searchInput.value = '';
  load();
}

// The same way out, offered in the two places you might be looking for it.
clearButton.addEventListener('click', clearFilters);
emptyClear.addEventListener('click', clearFilters);

let saying;

/** Say something under the drawer's head, and take it back once it is read. */
function tell(words) {
  said.textContent = words;
  said.classList.add('is-said');
  clearTimeout(saying);
  saying = setTimeout(() => said.classList.remove('is-said'), 2200);
}

/**
 * The link to here.
 *
 * `location` is already the answer — the address is kept as the map is read —
 * so this is only the handing over of it. The clipboard is asked first and a
 * hidden field is the fallback, because a page served from a file, or from
 * inside an app's web view, has no clipboard to ask.
 */
async function copyLink() {
  const link = location.href;
  let done = false;
  try {
    await navigator.clipboard.writeText(link);
    done = true;
  } catch {
    const field = document.createElement('textarea');
    field.value = link;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:-1000px';
    document.body.append(field);
    field.select();
    try {
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    field.remove();
  }

  if (!done) {
    window.prompt('Copy this link to share the view', link);
    return;
  }
  // Said under the bar and then taken back. A message that stays is a label,
  // and this is not a label — it is the answer to a press.
  tell('Copied to clipboard');
}

shareButton.addEventListener('click', copyLink);

resetButton.addEventListener('click', () => map.reset());

// Not everyone has a wheel, and the map's detail is behind its zoom.
zoomInButton.addEventListener('click', () => map.zoomBy(1.4));
zoomOutButton.addEventListener('click', () => map.zoomBy(1 / 1.4));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!librarianPill.hidden) return showPill(false);
    if (drawerOpen()) return closeDrawers();
    closePanel();
    map.reset();
  }
  if (event.key === '/' && document.activeElement !== searchInput) {
    event.preventDefault();
    showSearch();
  }
});

/* --- the librarian ---------------------------------------------------------
   A mark on the map that offers to help. Pressed, it says what it can do, in
   a speech pill beside it; Ask goes to the librarian's own map. */

const librarianButton = document.getElementById('librarian-open');
const librarianPill = document.getElementById('librarian-pill');

librarianButton.innerHTML = librarianGlyph();

function showPill(open) {
  librarianPill.hidden = !open;
  librarianButton.setAttribute('aria-expanded', String(open));
}

librarianButton.addEventListener('click', () => showPill(librarianPill.hidden));
document.getElementById('librarian-dismiss').addEventListener('click', () => {
  showPill(false);
  librarianButton.focus();
});
document.addEventListener('pointerdown', (event) => {
  if (!librarianPill.hidden && !event.target.closest('.librarian-call')) showPill(false);
});

readUrl();
fillCount();
load();
