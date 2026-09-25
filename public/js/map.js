/** Wiring for /map: state in the URL, graph from the API, drawing in constellation.js. */

import { api, citationLine, escapeHtml, fillCount, hostOf, usingSnapshot } from './api.js';
import { createConstellation } from './constellation.js';
import { blobPath, needsPaper, seedOf } from './ink.js';
import { A4, Sheet, toBlob } from './pdf.js';

const canvas = document.getElementById('constellation');
const zoomCluster = document.querySelector('.map-zoom');
const searchInput = document.getElementById('panel-search');
const searchOpen = document.getElementById('map-search-open');
const filterBox = document.getElementById('map-filters');
const clearButton = document.getElementById('map-clear');
const moreButton = document.getElementById('map-more');
const drawer = document.getElementById('tag-drawer');
const drawerList = document.getElementById('tag-drawer-list');
const placeBox = document.getElementById('map-places');
const placeMoreButton = document.getElementById('map-place-more');
const placeDrawer = document.getElementById('place-drawer');
const placeDrawerList = document.getElementById('place-drawer-list');
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
}

function writeUrl() {
  const params = new URLSearchParams();
  for (const tag of state.tags) params.append('tag', tag);
  if (state.query) params.set('q', state.query);
  const search = params.toString();
  history.replaceState(null, '', search ? `?${search}` : location.pathname);
}

function toggleTag(slug) {
  if (state.tags.has(slug)) state.tags.delete(slug);
  else state.tags.add(slug);
}

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
    renderFilters();
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
  } catch (error) {
    legend.innerHTML = `<b>The map could not be drawn.</b> ${escapeHtml(error.message)}`;
  }
}

/* --- chrome ------------------------------------------------------------- */

let vocabulary = [];
let places = [];

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
    vocabulary = tags.filter((t) => t.facet !== 'location');
    places = tags.filter((t) => t.facet === 'location');
  }

  filterBox.innerHTML = leading(vocabulary, 18).map(tagChip).join('');
  drawerList.innerHTML = vocabulary.map(tagChip).join('');
  placeBox.innerHTML = leading(places, 8).map(tagChip).join('');
  placeDrawerList.innerHTML = places.map(tagChip).join('');
  tuckTags();

  clearButton.hidden = state.tags.size === 0 && !state.query;
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

/** What the first `count` chips in a box would take, gaps included. */
function widthOf(box, count) {
  const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
  return [...box.children]
    .slice(0, count)
    .reduce((total, chip) => total + chip.offsetWidth + gap, -gap);
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
    const width = chip.offsetWidth;
    if (full || used + width > room) {
      full = true;
      chip.hidden = true;
      continue;
    }
    used += width + gap;
  }
  const width = Math.max(used - gap, 0);
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
drawers.push(hangDrawer(moreButton, drawer), hangDrawer(placeMoreButton, placeDrawer));

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

/** The mark a piece of research wears everywhere: on the map, and in a list. */
const CROSSHAIR = `<svg class="crosshair" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="9"/><path d="M12 4.6 V19.4 M4.6 12 H19.4"/></svg>`;

/** A tag's own blot, drawn at label size from the same seed the map uses. */
const blotMark = (id) =>
  `<svg class="blot" viewBox="-13 -13 26 26" aria-hidden="true" focusable="false">
    <path d="${blobPath(seedOf(id), 11, { lobes: 8, wobble: 0.85 })}"/></svg>`;

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

const placeWithin = (slug) => places.find((p) => p.slug === slug)?.within ?? null;

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

const WHEN = () =>
  new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

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

/**
 * Hand a file to whoever is reading.
 *
 * A page is not always allowed to do this by itself — inside a sandbox an
 * ordinary download link does nothing at all — so a host that has its own way
 * of doing it leaves that way here, and it is used in preference.
 */
function hand(name, data) {
  if (typeof window.__ATLAS_SAVE__ === 'function') {
    window.__ATLAS_SAVE__(name, data);
    return;
  }

  const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked late: some browsers are still reading the blob as the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
  searchInput.focus();
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
  // A theme is listed when it is what you typed. Research is listed whenever it
  // survived the search, which is what surviving the search means.
  const themes = nodes.filter((n) => n.type === 'tag' && n.label.toLowerCase().includes(query));
  const sources = nodes.filter((n) => n.type === 'source');

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
  places.find((t) => t.slug === slug)?.label ??
  state.graph?.nodes.find((n) => n.slug === slug)?.label ??
  slug;

/* The card's own scrollbar: a hairline down the edge of the record with a dot at
   your place in it. It is hidden the moment there is nothing to scroll. */

const rail = document.getElementById('scroll-rail');
const railDot = document.getElementById('scroll-dot');

function trackScroll() {
  const room = panelBody.scrollHeight - panelBody.clientHeight;
  const live = room > 2;
  rail.classList.toggle('is-live', live);
  if (!live) return;
  const travel = Math.max(rail.clientHeight - railDot.offsetHeight, 0);
  railDot.style.transform = `translateY(${Math.round((panelBody.scrollTop / room) * travel)}px)`;
}

panelBody.addEventListener('scroll', trackScroll, { passive: true });
window.addEventListener('resize', trackScroll);
if (window.ResizeObserver) new ResizeObserver(trackScroll).observe(panelBody);

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

/* --- the panel, which on a phone is a bottom sheet ----------------------- */

const grip = document.getElementById('sheet-grip');

// The sheet layout is the one that gives the grip a box, so asking the grip is
// the same question the stylesheet answers and the two cannot drift apart.
const isSheet = () => getComputedStyle(grip).display !== 'none';

function cssLength(value) {
  const length = parseFloat(value);
  if (!Number.isFinite(length)) return 0;
  return value.trim().endsWith('rem')
    ? length * parseFloat(getComputedStyle(document.documentElement).fontSize)
    : length;
}

// How much of the sheet stands above the fold while it is only peeking, and how
// far it has left to climb before it is all the way up.
const peekHeight = () => cssLength(getComputedStyle(panel).getPropertyValue('--sheet-peek'));
const travel = () => Math.max(panel.offsetHeight - peekHeight(), 0);

function setSheet(next) {
  panel.dataset.sheet = next;
  grip.setAttribute('aria-expanded', String(next === 'open'));
  // The preview hides most of the record, so how much there is to scroll
  // changes with the state — and it changes without the sheet's box changing,
  // which is the one thing the observer below would have noticed.
  trackScroll();
}

function openPanel() {
  // A record arrives as a preview — its title bar and the line under it — and
  // the map keeps the screen until you ask for the rest. But an open drawer
  // stays open: opening something else from the map while you are reading is a
  // change of subject, not a reason to put the drawer away and start again.
  panel.style.transform = '';
  panel.style.height = '';
  const carryOn = panel.classList.contains('is-open') && panel.dataset.sheet === 'open';
  setSheet(carryOn ? 'open' : 'peek');
  measurePeek();
  panel.classList.add('is-open');
  panelBody.scrollTop = 0;
  trackScroll();
}

/**
 * How much sheet the preview needs, measured rather than guessed: a tag has no
 * citation line under its name and a piece of research does, and one fixed
 * height would leave one of them showing a band of empty paper.
 */
function measurePeek() {
  const head = document.getElementById('panel-head');
  const meta = panelBody.querySelector('.panel__meta');
  // Measured to the bottom edge of the last thing in the preview: the title bar
  // for a tag, the citation line for a piece of research. Anything beyond that
  // is a band of empty paper under the colour.
  const top = panel.getBoundingClientRect().top;
  const last = (meta ?? head).getBoundingClientRect().bottom;
  const peek = last - top + (meta ? 14 : 0);
  if (peek <= 0) return;
  panel.style.setProperty('--sheet-peek', `${Math.round(peek)}px`);
  // The floating zoom cluster rides above the drawer, and it is a cousin of the
  // sheet rather than a child of it, so the measurement is published on the
  // shell where both can read it.
  panel.parentElement.style.setProperty('--sheet-peek', `${Math.round(peek)}px`);
}

function closePanel() {
  panel.style.transform = '';
  panel.classList.remove('is-open');
  setSheet('peek');
  map.highlight(null);
  searchOpen.setAttribute('aria-expanded', 'false');
}

// Whenever the sheet settles, the map reframes into whatever is left of it —
// down for the room it gets back, up so that what you opened stays on screen in
// the band above the drawer rather than disappearing behind it.
panel.addEventListener('transitionend', (event) => {
  if (event.propertyName !== 'transform' || event.target !== panel) return;
  if (isSheet() && panel.classList.contains('is-open')) map.fit();
});

/* Drag — from the grip at any time, from anywhere on the sheet while it peeks,
   since nothing is scrolling under your thumb then. */

let drag = null;
let suppressClick = false;

function draggableFrom(event) {
  if (!isSheet() || !panel.classList.contains('is-open')) return false;
  if (event.pointerType === 'mouse' && event.button !== 0) return false;
  if (event.target.closest('.panel__close')) return false;
  return Boolean(event.target.closest('.sheet-grip')) || panel.dataset.sheet === 'peek';
}

panel.addEventListener('pointerdown', (event) => {
  if (!draggableFrom(event)) return;
  const distance = travel();
  const from = panel.dataset.sheet === 'open' ? 0 : distance;
  drag = {
    id: event.pointerId,
    y: event.clientY,
    lastY: event.clientY,
    lastAt: event.timeStamp,
    moved: 0,
    // The same allowance the map gives a tap: a thumb rolls as it lifts, and a
    // sheet that starts sliding at four pixels turns half the taps on it into
    // little drags that go nowhere.
    slop: event.pointerType === 'mouse' ? 4 : 10,
    base: from,
    offset: from,
    travel: distance,
    height: panel.offsetHeight,
    captured: false,
  };
  // The finger leaves the sheet within the first few pixels of dragging it up,
  // so the rest of the gesture is followed from the window rather than from the
  // element it started on.
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
});

function onMove(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const dy = event.clientY - drag.y;
  drag.moved = Math.max(drag.moved, Math.abs(dy));
  if (drag.moved < drag.slop) return;
  if (!drag.captured) {
    // Captured only once this is really a drag. Capture keeps the map from
    // taking the rest of the gesture — and it retargets the click that follows
    // to the sheet, which a tap on a link inside the sheet could not survive.
    panel.setPointerCapture(event.pointerId);
    drag.captured = true;
  }
  panel.classList.add('is-dragging');
  // Below the peek line the sheet keeps going, because a shove downwards is how
  // you put a record away.
  const raw = drag.base + dy;
  drag.offset = Math.min(raw, drag.travel + peekHeight());
  drag.lastY = event.clientY;
  drag.lastAt = event.timeStamp;

  if (drag.offset < 0) {
    // Pulled above its open position the sheet grows upwards instead of
    // travelling: anchored to the bottom of the screen, it can stretch without
    // opening a gap under itself. The give is resisted and runs out, so it
    // reads as the top of the record rather than as somewhere left to go.
    panel.style.transform = 'translateY(0px)';
    panel.style.height = `${Math.round(drag.height + rubber(-drag.offset))}px`;
    return;
  }
  panel.style.height = '';
  panel.style.transform = `translateY(${drag.offset}px)`;
}

/** Resisted give: distance short of `limit`, approaching it and never past. */
const rubber = (distance, limit = 72) => (distance * limit) / (distance + limit);

function endDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const gesture = drag;
  drag = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', endDrag);
  panel.classList.remove('is-dragging');
  panel.style.transform = '';
  panel.style.height = '';
  if (gesture.moved < 4) return; // a tap: the click handler below has it

  // A drag that ends over the sheet would otherwise land as a click on whatever
  // is under the finger. Only the click of this gesture is swallowed — a drag
  // that ends without one must not eat the next tap.
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  const elapsed = Math.max(event.timeStamp - gesture.lastAt, 1);
  const velocity = (event.clientY - gesture.lastY) / elapsed; // px/ms, downwards positive
  const peek = peekHeight();

  if (gesture.offset > gesture.travel + peek * 0.4 || (velocity > 0.5 && gesture.offset >= gesture.travel)) {
    closePanel();
    map.reset();
    return;
  }
  // A flick decides on its own; a slow drag is decided by where it was let go.
  if (velocity < -0.35) setSheet('open');
  else if (velocity > 0.35) setSheet('peek');
  else setSheet(gesture.offset < gesture.travel * 0.5 ? 'open' : 'peek');
}

/* Tap — the grip toggles, and a peeking sheet opens wherever you touch it. The
   same two moves as the drag, for anyone who would rather not drag. */

panel.addEventListener('click', (event) => {
  if (suppressClick) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!isSheet() || event.target.closest('.panel__close')) return;
  if (event.target.closest('.sheet-grip')) {
    setSheet(panel.dataset.sheet === 'open' ? 'peek' : 'open');
    return;
  }
  if (panel.dataset.sheet !== 'open' && !event.target.closest('a, button')) setSheet('open');
});

// The sheet is a phone arrangement; crossing back to the desktop one leaves it
// with a half-dragged transform and an expanded state that mean nothing there.
let settling;
window.addEventListener('resize', () => {
  // Nothing animates while the window is being dragged. The card is parked off
  // the right in one layout and under the bottom in the other, so a resize
  // across the breakpoint would otherwise play that journey — a closed drawer
  // sliding over the map, animating a thing that is not even open.
  panel.classList.add('is-resizing');
  clearTimeout(settling);
  settling = setTimeout(() => panel.classList.remove('is-resizing'), 160);

  if (!isSheet()) {
    panel.style.transform = '';
    setSheet('peek');
  }
});

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

resetButton.addEventListener('click', () => map.reset());

// Not everyone has a wheel, and the map's detail is behind its zoom.
zoomInButton.addEventListener('click', () => map.zoomBy(1.4));
zoomOutButton.addEventListener('click', () => map.zoomBy(1 / 1.4));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (drawerOpen()) return closeDrawers();
    closePanel();
    map.reset();
  }
  if (event.key === '/' && document.activeElement !== searchInput) {
    event.preventDefault();
    showSearch();
  }
});

readUrl();
fillCount();
load();
