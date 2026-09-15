/** Wiring for /map: state in the URL, graph from the API, drawing in constellation.js. */

import { api, citationLine, escapeHtml, fillCount, hostOf } from './api.js';
import { createConstellation } from './constellation.js';

const canvas = document.getElementById('constellation');
const searchInput = document.getElementById('map-search');
const filterBox = document.getElementById('map-filters');
const clearButton = document.getElementById('map-clear');
const resetButton = document.getElementById('map-reset');
const zoomInButton = document.getElementById('map-in');
const zoomOutButton = document.getElementById('map-out');
const legend = document.getElementById('map-legend');
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panel-body');

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
    if (!panel.classList.contains('is-open')) return {};
    const canvasBox = canvas.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    if (panelBox.left >= canvasBox.right) return {};
    // On a narrow screen the panel rises from the bottom across the full width;
    // on a wide one it sits against the right edge. Which one it is has to be
    // read from where it actually is, not from where it starts vertically —
    // the desktop panel is inset from the top too.
    const fullWidth = panelBox.left <= canvasBox.left + 2;
    return fullWidth
      ? { bottom: Math.max(canvasBox.bottom - panelBox.top, 0) }
      : { right: Math.max(canvasBox.right - panelBox.left, 0) };
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

function showTag(node) {
  const sources = (state.graph?.links ?? [])
    .filter((l) => l.kind === 'tagged' && (l.source === node.id || l.target === node.id))
    .map((l) => state.graph.nodes.find((n) => n.id === (l.source === node.id ? l.target : l.source)))
    .filter((n) => n?.type === 'source')
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.label.localeCompare(b.label));

  panelBody.innerHTML = `
    <h3>${escapeHtml(node.label)}</h3>
    <p class="panel__meta">${plural(sources.length, 'source')}${
      node.facet && node.facet !== 'open' ? ` · ${escapeHtml(node.facet)}` : ''
    }</p>
    ${node.note ? `<p class="panel__summary">${escapeHtml(node.note)}</p>` : ''}
    <p><button class="label label--small" type="button" data-tag="${escapeHtml(node.slug)}">Filter the library to this</button></p>
    <h4>What sits here</h4>
    <ul class="panel__links">${sources
      .map(
        (source) =>
          `<li><a href="#" data-open="${escapeHtml(source.id)}">${escapeHtml(source.label)}
            <small>${escapeHtml(citationLine(source) || hostOf(source.url))}</small></a></li>`,
      )
      .join('')}</ul>`;
  panel.classList.add('is-open');
}

function showRecord(node) {
  if (!node) {
    panel.classList.remove('is-open');
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

  panelBody.innerHTML = `
    <h3>${escapeHtml(node.label)}</h3>
    <p class="panel__meta">${escapeHtml(citationLine(node)) || escapeHtml(hostOf(node.url))}</p>
    ${node.summary ? `<p class="panel__summary">${escapeHtml(node.summary)}</p>` : ''}
    ${node.note ? `<p class="record__note">${escapeHtml(node.note)}</p>` : ''}
    <p><a class="label label--small" href="${escapeHtml(node.url)}" target="_blank" rel="noopener noreferrer">Read the source ↗</a></p>
    <h4>Tagged</h4>
    <div class="tag-cloud">${(node.tags ?? [])
      .map((slug) => `<button class="tag" type="button" data-tag="${escapeHtml(slug)}">${escapeHtml(labelOf(slug))}</button>`)
      .join('')}</div>
    ${
      related.length
        ? `<h4>Read alongside</h4>
           <ul class="panel__links">${related
             .map(
               ({ other, shared }) =>
                 `<li><a href="#" data-open="${escapeHtml(other.id)}">${escapeHtml(other.label)}
                   <small>shares ${shared.map((s) => escapeHtml(labelOf(s))).join(', ') || 'related vocabulary'}</small></a></li>`,
             )
             .join('')}</ul>`
        : ''
    }
    ${node.contributor ? `<h4>Added by</h4><p class="panel__meta">${escapeHtml(node.contributor)}</p>` : ''}`;
  panel.classList.add('is-open');
}

const labelOf = (slug) =>
  vocabulary.find((t) => t.slug === slug)?.label ??
  state.graph?.nodes.find((n) => n.slug === slug)?.label ??
  slug;

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
  panel.classList.remove('is-open');
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
    panel.classList.remove('is-open');
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
