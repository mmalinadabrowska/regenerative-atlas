/** Wiring for /map: state in the URL, graph from the API, drawing in constellation.js. */

import { api, citationLine, escapeHtml, fillCount, hostOf } from './api.js';
import { createConstellation } from './constellation.js';
import { blobPath, seedOf } from './ink.js';

const canvas = document.getElementById('constellation');
const zoomCluster = document.querySelector('.map-zoom');
const searchInput = document.getElementById('map-search');
const filterBox = document.getElementById('map-filters');
const clearButton = document.getElementById('map-clear');
const resetButton = document.getElementById('map-reset');
const zoomInButton = document.getElementById('map-in');
const zoomOutButton = document.getElementById('map-out');
const legend = document.getElementById('map-legend');
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

    const controls = filterBox.closest('.map-controls')?.getBoundingClientRect();
    if (controls && controls.bottom > canvasBox.top) {
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

function placePanel() {
  const shell = canvas.parentElement;
  const top = controlsRow.getBoundingClientRect().bottom - shell.getBoundingClientRect().top;
  panel.style.setProperty('--panel-top', `${Math.max(Math.round(top + 12), 12)}px`);
}

if (window.ResizeObserver) new ResizeObserver(placePanel).observe(controlsRow);
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
  } catch (error) {
    legend.innerHTML = `<b>The map could not be drawn.</b> ${escapeHtml(error.message)}`;
  }
}

/* --- chrome ------------------------------------------------------------- */

let vocabulary = [];

async function renderFilters() {
  if (vocabulary.length === 0) {
    const { tags } = await api.tags();
    vocabulary = tags;
  }
  const top = vocabulary.slice(0, 8);
  const chosen = [...state.tags].filter((slug) => !top.some((t) => t.slug === slug));
  const shown = [
    ...chosen.map((slug) => vocabulary.find((t) => t.slug === slug) ?? { slug, label: slug, count: 0 }),
    ...top,
  ];

  filterBox.innerHTML = shown
    .map(
      (tag) => `<button class="tag" type="button" data-tag="${escapeHtml(tag.slug)}"
        aria-pressed="${state.tags.has(tag.slug)}">${escapeHtml(tag.label)}
        <span class="tag__count">${tag.count}</span></button>`,
    )
    .join('');

  clearButton.hidden = state.tags.size === 0 && !state.query;
}

const plural = (n, word) => `<b>${n}</b> ${word}${n === 1 ? '' : 's'}`;

function renderLegend(graph, opened = map.opened?.()) {
  if (!graph) return;
  const { sources, tags } = graph.stats;

  if (opened) {
    const what =
      opened.type === 'tag'
        ? `${plural(opened.count ?? 0, 'source')} filed under <b>${escapeHtml(opened.label)}</b>`
        : `<b>${escapeHtml(opened.label)}</b> — what it is filed under, and what it sits beside`;
    legend.innerHTML = `
      ${what}<br>
      <span style="opacity:.75">Open anything else to travel on.
      Click the empty ground to come back to the islands.</span>`;
    return;
  }

  legend.innerHTML = `
    ${plural(tags, 'theme')} across ${plural(sources, 'source')}.<br>
    <span style="opacity:.75">Each blot is a tag, sized by how much research sits
    under it. Open one to see what it holds.</span>`;
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
  panelGlyph.innerHTML = glyph;
  panelTitle.textContent = title;
}

const washOfTag = (slug) => map.washOf(`t:${slug}`);

const tagChips = (slugs) =>
  `<div class="tag-cloud">${slugs
    .map((slug) => {
      const wash = washOfTag(slug);
      return `<button class="tag tag--wash" type="button" data-tag="${escapeHtml(slug)}"${
        wash ? ` style="--chip: ${wash}"` : ''
      }>${escapeHtml(labelOf(slug))}</button>`;
    })
    .join('')}</div>`;

/**
 * One row of the research list: the mark, the name, and what it is to you. The
 * row is the same wherever research is listed — under a tag it is named by its
 * citation, under another piece of research by what the two share — because it
 * is the same thing being listed, and the mark is how you find it on the map.
 */
const threadRow = (node, under) =>
  `<li><a href="#" data-open="${escapeHtml(node.id)}">
    ${CROSSHAIR}
    <span class="thread__name">${escapeHtml(node.label)}
      <small>${under}</small></span></a></li>`;

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
  panelBody.innerHTML = `
    ${node.note ? `<p class="panel__summary">${escapeHtml(node.note)}</p>` : ''}
    <p><button class="label label--small" type="button" data-tag="${escapeHtml(node.slug)}">Filter the library to this</button></p>
    <h4>Research threads</h4>
    <ul class="panel__links">${sources
      .map((source) =>
        threadRow(source, escapeHtml(citationLine(source) || hostOf(source.url))),
      )
      .join('')}</ul>
    ${connected.length ? `<h4>Connected tags</h4>${tagChips(connected)}` : ''}`;
  openPanel();
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
  panelBody.innerHTML = `
    <p class="panel__meta">${escapeHtml(citationLine(node)) || escapeHtml(hostOf(node.url))}</p>
    ${node.summary ? `<p class="panel__summary">${escapeHtml(node.summary)}</p>` : ''}
    ${node.note ? `<p class="record__note">${escapeHtml(node.note)}</p>` : ''}
    <p><a class="label label--small" href="${escapeHtml(node.url)}" target="_blank" rel="noopener noreferrer">Read the source ↗</a></p>
    <h4>Tagged</h4>
    ${tagChips(node.tags ?? [])}
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
  map.highlight(row ? row.dataset.open : null);
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
  if (drag.moved < 4) return;
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
window.addEventListener('resize', () => {
  if (!isSheet()) {
    panel.style.transform = '';
    setSheet('peek');
  }
});

/* --- events ------------------------------------------------------------- */

document.addEventListener('click', (event) => {
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

clearButton.addEventListener('click', () => {
  state.tags.clear();
  state.query = '';
  searchInput.value = '';
  load();
});

resetButton.addEventListener('click', () => map.reset());

// Not everyone has a wheel, and the map's detail is behind its zoom.
zoomInButton.addEventListener('click', () => map.zoomBy(1.4));
zoomOutButton.addEventListener('click', () => map.zoomBy(1 / 1.4));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closePanel();
    map.reset();
  }
  if (event.key === '/' && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
});

readUrl();
fillCount();
load();
