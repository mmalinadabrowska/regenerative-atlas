/** Wiring for /themes: keyword search and the tag vocabulary as a browsable index. */

import { api, citationLine, escapeHtml, fillCount, hostOf } from './api.js';

const searchInput = document.getElementById('search');
const searchForm = document.getElementById('search-form');
const facetBox = document.getElementById('facets');
const results = document.getElementById('results');
const resultsCount = document.getElementById('results-count');
const resultsHeading = document.getElementById('results-heading');

const state = { tags: new Set(), query: '' };
let vocabulary = [];

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

async function renderFacets() {
  const { facets, tags } = await api.tags();
  vocabulary = tags;
  facetBox.innerHTML = facets
    .map(
      (facet) => `
      <div class="section-head">
        <h2>${escapeHtml(facet.label)}</h2>
        <p>${escapeHtml(facet.note)}</p>
      </div>
      <div class="tag-cloud">${facet.tags
        .map(
          (tag) => `<button class="tag${tag.core ? '' : ' tag--ghost'}" type="button"
            data-tag="${escapeHtml(tag.slug)}" aria-pressed="${state.tags.has(tag.slug)}"
            title="${escapeHtml(tag.note ?? 'Coined by a contributor.')}">${escapeHtml(tag.label)}
            <span class="tag__count">${tag.count}</span></button>`,
        )
        .join('')}</div>`,
    )
    .join('');
}

function refreshPressedState() {
  for (const button of facetBox.querySelectorAll('[data-tag]')) {
    button.setAttribute('aria-pressed', String(state.tags.has(button.dataset.tag)));
  }
}

function recordHtml(source) {
  const tags = source.tags
    .map((t) => `<a class="tag" href="?tag=${encodeURIComponent(t.slug)}">${escapeHtml(t.label)}</a>`)
    .join('');
  return `<li class="record">
    <h3 class="record__title"><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a></h3>
    <p class="record__meta">${escapeHtml(citationLine(source) || hostOf(source.url))}${
      source.contributor ? ` · added by ${escapeHtml(source.contributor)}` : ''
    }</p>
    ${source.summary ? `<p class="record__summary">${escapeHtml(source.summary)}</p>` : ''}
    ${source.note ? `<p class="record__note">${escapeHtml(source.note)}</p>` : ''}
    <div class="tag-cloud">${tags}</div>
  </li>`;
}

async function load() {
  writeUrl();
  refreshPressedState();

  const params = {};
  if (state.tags.size) params.tag = [...state.tags].join(',');
  if (state.query) params.q = state.query;

  const { sources, total } = await api.sources({ ...params, limit: 300 });

  const chosen = [...state.tags].map(
    (slug) => vocabulary.find((t) => t.slug === slug)?.label ?? slug,
  );
  resultsHeading.textContent = chosen.length ? chosen.join(' + ') : state.query ? `“${state.query}”` : 'The library';
  resultsCount.textContent = `${sources.length} of ${total} sources`;

  results.innerHTML = sources.length
    ? sources.map(recordHtml).join('')
    : `<li class="empty">Nothing here yet. <a href="/add">Add the first one.</a></li>`;
}

facetBox.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tag]');
  if (!button) return;
  const slug = button.dataset.tag;
  if (state.tags.has(slug)) state.tags.delete(slug);
  else state.tags.add(slug);
  load();
});

results.addEventListener('click', (event) => {
  const link = event.target.closest('a.tag');
  if (!link) return;
  event.preventDefault();
  state.tags = new Set([new URL(link.href).searchParams.get('tag')]);
  load();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  state.query = searchInput.value.trim();
  load();
});

let timer;
searchInput.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    state.query = searchInput.value.trim();
    load();
  }, 300);
});

readUrl();
fillCount();
await renderFacets();
await load();
