/** Wiring for /map: state in the URL, graph from the API, drawing in constellation.js. */

import { api, citationLine, escapeHtml, fillCount, hostOf } from './api.js';
import { createConstellation } from './constellation.js';

const canvas = document.getElementById('constellation');
const searchInput = document.getElementById('map-search');
const filterBox = document.getElementById('map-filters');
const clearButton = document.getElementById('map-clear');
const resetButton = document.getElementById('map-reset');
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
  onTagToggle: (slug) => {
    toggleTag(slug);
    load();
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

async function load({ keepView = true } = {}) {
  writeUrl();
  const ticket = ++inFlight;
  const params = {};
  if (state.tags.size) params.tag = [...state.tags].join(',');
  if (state.query) params.q = state.query;

  try {
    const graph = await api.graph(params);
    if (ticket !== inFlight) return;
    state.graph = graph;
    map.setGraph(graph, { keepView });
    renderLegend(graph);
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

function renderLegend(graph) {
  const { sources, kin, clusters } = graph.stats;
  const names = graph.clusters
    .slice(0, 6)
    .map((c) => escapeHtml(c.label))
    .join(' · ');
  legend.innerHTML = `
    ${plural(sources, 'source')}, ${plural(kin, 'line')} of kinship, ${plural(clusters, 'cluster')}.<br>
    ${names}<br>
    <span style="opacity:.75">Stars are tags, ink is research. Drag to pan, scroll to zoom,
    click a tag to filter.</span>`;
}

/* --- the record panel --------------------------------------------------- */

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
                 `<li><a href="#" data-focus="${escapeHtml(other.id)}">${escapeHtml(other.label)}
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
  const focusLink = event.target.closest('[data-focus]');
  if (focusLink) {
    event.preventDefault();
    map.focus(focusLink.dataset.focus);
  }
});

document.getElementById('panel-close').addEventListener('click', () => {
  panel.classList.remove('is-open');
  map.select(null);
});

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = searchInput.value.trim();
    load({ keepView: false });
  }, 260);
});

clearButton.addEventListener('click', () => {
  state.tags.clear();
  state.query = '';
  searchInput.value = '';
  load({ keepView: false });
});

resetButton.addEventListener('click', () => map.reset());

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    panel.classList.remove('is-open');
    map.select(null);
  }
  if (event.key === '/' && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
});

readUrl();
fillCount();
load({ keepView: false });
