/**
 * Wiring for /ask: a question in prose, answered from this library.
 *
 * The thread is kept in the page and nowhere else. Each question is answered on
 * its own — there is no memory to mislead you into thinking the Atlas is
 * following a conversation it is not.
 */

import { api, citationLine, escapeHtml, fillCount, hostOf } from './api.js';

const form = document.getElementById('ask-form');
const field = document.getElementById('ask-question');
const button = document.getElementById('ask-send');
const thread = document.getElementById('ask-thread');

const CROSSHAIR = `<svg class="crosshair" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="9"/><path d="M12 4.6 V19.4 M4.6 12 H19.4"/></svg>`;

const line = (text) => `<p>${escapeHtml(text)}</p>`;

/** What the Atlas found, in the same rows the map's record card uses. */
function results(found) {
  if (found.length === 0) return '';
  return `<ul class="panel__links">${found
    .map(
      (source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
        ${CROSSHAIR}
        <span class="thread__name">${escapeHtml(source.title)}
          <small>${escapeHtml(citationLine(source) || hostOf(source.url))}${
            source.why.tags.length ? ` · under ${source.why.tags.map((slug) => escapeHtml(slug)).join(', ')}` : ''
          }</small></span></a></li>`,
    )
    .join('')}</ul>`;
}

/** The subjects the question was read as, each a door into the map. */
function reading(tags) {
  if (tags.length === 0) return '';
  const query = tags.map((tag) => encodeURIComponent(tag.slug)).join(',');
  return `<div class="tag-cloud">${tags
    .map(
      (tag) => `<a class="tag" href="/map?tag=${encodeURIComponent(tag.slug)}">${escapeHtml(tag.label)}
        <span class="tag__count">${tag.count}</span></a>`,
    )
    .join('')}</div>
    <p class="ask__onward"><a class="label label--small" href="/map?tag=${query}">See this on the map ↗</a></p>`;
}

function exchange(question, answer, { pending = false, error = '' } = {}) {
  const turn = document.createElement('div');
  turn.className = 'ask__turn';
  turn.innerHTML = `
    <p class="ask__asked">${escapeHtml(question)}</p>
    <div class="ask__answer">${
      pending
        ? '<p class="spinner-note">Reading the library…</p>'
        : error
          ? `<p class="notice notice--bad">${escapeHtml(error)}</p>`
          : `${answer.said.map(line).join('')}${reading(answer.reading.tags)}${results(answer.found)}`
    }</div>`;
  return turn;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = field.value.trim();
  if (!question) return;

  const turn = exchange(question, null, { pending: true });
  thread.prepend(turn);
  field.value = '';
  button.disabled = true;
  turn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    const answer = await api.ask(question);
    turn.replaceWith(exchange(question, answer));
  } catch (error) {
    turn.replaceWith(exchange(question, null, { error: error.message }));
  } finally {
    button.disabled = false;
    field.focus();
  }
});

// Enter sends, shift-enter makes a new line: it is a question, not an essay.
field.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

fillCount();

// Say plainly how much library there is to search.
api
  .stats()
  .then(({ sources }) => {
    document.getElementById('ask-scope').textContent = `these ${sources} sources`;
  })
  .catch(() => {});
