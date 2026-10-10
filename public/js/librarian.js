/**
 * Wiring for /librarian: a map that starts blank and is drawn from a question.
 *
 * The visitor tells the librarian what they are exploring; the server reads the
 * whole library against it (see server/librarian.js) and answers with a few
 * themes, the reasoning for each, and the research that belongs to them. That
 * answer is drawn here as a constellation — a blot for each theme, a point for
 * each piece of research, dotted lines between them — and read in the drawer,
 * which can be printed whole or set aside to ask again.
 */

import { api, citationLine, escapeHtml, fillCount, hostOf } from './api.js';
import { createConstellation } from './constellation.js';
import { CROSSHAIR, WHEN, WIDE_FRAME, blotMark, createDrawer, hand, printGraph } from './drawer.js';
import { librarianGlyph } from './glyph.js';
import { needsPaper } from './ink.js';
import { A4, Sheet, toBlob } from './pdf.js';

const canvas = document.getElementById('constellation');
const controlsRow = document.querySelector('.map-controls');
const zoomCluster = document.querySelector('.map-zoom');
const legend = document.getElementById('map-legend');
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panel-body');
const panelGlyph = document.getElementById('panel-glyph');
const panelTitle = document.getElementById('panel-title');
const toggle = document.getElementById('librarian-toggle');

const WELCOME =
  "Welcome. I can now help you search the map for a specific question or idea you're exploring. " +
  'Tell me more about it and I can pull out relevant references from the library.';

const state = {
  /** The whole library, to find what the librarian names by its link. */
  library: null,
  question: '',
  answer: null,
  asking: false,
  error: '',
  /** What the drawer is showing: the form, the answer, or one thing from it. */
  view: 'ask',
};

const map = createConstellation(canvas, {
  constellation: true,
  onSelect: (node) => {
    if (node) showRecord(node);
  },
  onFocus: (node) => {
    if (node?.type === 'tag') showGroup(node);
    // Back on the whole constellation: back to the whole answer.
    if (!node && state.answer && state.view !== 'answer') showAnswer();
    renderLegend();
  },
  inset() {
    const canvasBox = canvas.getBoundingClientRect();
    const controls = controlsRow.getBoundingClientRect();
    const gap = { top: Math.max(controls.bottom - canvasBox.top, 0) };
    if (!panel.classList.contains('is-open')) return gap;
    const panelBox = panel.getBoundingClientRect();
    if (panelBox.left >= canvasBox.right) return gap;
    const fullWidth = panelBox.left <= canvasBox.left + 2;
    if (!fullWidth) return { ...gap, right: Math.max(canvasBox.right - panelBox.left, 0) };
    return { ...gap, bottom: Math.max(canvasBox.bottom - panelBox.top, 0) };
  },
  avoid() {
    const canvasBox = canvas.getBoundingClientRect();
    return [toggle, zoomCluster, legend]
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.height > 0)
      .map((box) => ({
        x: box.left - canvasBox.left - 8,
        y: box.top - canvasBox.top - 8,
        w: box.width + 16,
        h: box.height + 16,
      }));
  },
});

const drawer = createDrawer({
  panel,
  head: document.getElementById('panel-head'),
  body: panelBody,
  grip: document.getElementById('sheet-grip'),
  rail: document.getElementById('scroll-rail'),
  railDot: document.getElementById('scroll-dot'),
  map,
  onClose: () => toggle.setAttribute('aria-expanded', 'false'),
});

function placePanel() {
  const shell = canvas.parentElement;
  const top = controlsRow.getBoundingClientRect().bottom - shell.getBoundingClientRect().top;
  panel.style.setProperty('--panel-top', `${Math.max(Math.round(top + 12), 12)}px`);
}
window.addEventListener('resize', placePanel);
placePanel();

toggle.innerHTML = librarianGlyph();
panelGlyph.innerHTML = librarianGlyph({ size: 'small' });
panel.dataset.kind = 'librarian';

/* --- the answer, as a constellation ----------------------------------------
   Each theme the librarian chose is a blot, and each piece of research a point
   tied to every theme it was placed in. A piece placed in two themes sits
   between them, which is the most honest picture of it there is. */

const GROUP = (index) => `g${index + 1}`;

function sourceByUrl(url) {
  return state.library?.nodes.find((node) => node.type === 'source' && node.url === url) ?? null;
}

/** The answer's groups, with the research in each found in the library. */
function groupsOf(answer) {
  return (answer?.groups ?? [])
    .map((group, index) => ({
      ...group,
      slug: GROUP(index),
      id: `t:${GROUP(index)}`,
      sources: group.sources.map(sourceByUrl).filter(Boolean),
    }))
    .filter((group) => group.sources.length > 0);
}

function graphOf(answer) {
  const groups = groupsOf(answer);
  const sources = new Map();
  groups.forEach((group, index) => {
    for (const source of group.sources) {
      if (!sources.has(source.id)) sources.set(source.id, { ...source, cluster: index });
    }
  });
  return {
    clusters: groups.map((group, index) => ({ id: index, label: group.title, title: group.title, tags: [group.slug] })),
    nodes: [
      ...groups.map((group, index) => ({
        id: group.id,
        type: 'tag',
        slug: group.slug,
        label: group.title,
        note: group.reasoning,
        count: group.sources.length,
        cluster: index,
      })),
      ...sources.values(),
    ],
    links: groups.flatMap((group) =>
      group.sources.map((source) => ({ source: source.id, target: group.id, kind: 'tagged' })),
    ),
  };
}

const EMPTY = { nodes: [], links: [], clusters: [] };

/* --- the drawer ------------------------------------------------------------ */

function setHead(title, glyph = librarianGlyph({ size: 'small' }), wash = null) {
  panel.style.setProperty('--head', wash || 'var(--ink)');
  panel.style.setProperty('--head-ink', needsPaper(wash) ? 'var(--paper)' : 'var(--ink)');
  if (!wash) panel.style.setProperty('--head-ink', 'var(--paper)');
  panelGlyph.innerHTML = glyph;
  panelTitle.textContent = title;
}

const open = () => {
  drawer.open();
  toggle.setAttribute('aria-expanded', 'true');
};

const threadRow = (node) => `<li><a href="#" data-open="${escapeHtml(node.id)}">
    ${CROSSHAIR}
    <span class="thread__name">${escapeHtml(node.label)}
      <small>${escapeHtml(citationLine(node) || hostOf(node.url))}</small></span></a></li>`;

function showAsk({ focus = true } = {}) {
  state.view = 'ask';
  setHead('The librarian');
  const waiting = state.asking
    ? `<p class="librarian__waiting" role="status"><span class="librarian__dots" aria-hidden="true"><i></i><i></i><i></i></span>
         Reading the library…</p>`
    : '';
  panelBody.innerHTML = `
    <p class="panel__meta librarian__lead">${escapeHtml(WELCOME)}</p>
    <form class="librarian__form" id="librarian-form">
      <label class="visually-hidden" for="librarian-question">Your question or idea</label>
      <textarea class="librarian__field" id="librarian-question" maxlength="600" rows="5"
        placeholder="For example: how can bio-based materials help retrofit older housing without losing what makes it local?"
        ${state.asking ? 'disabled' : ''}>${escapeHtml(state.question)}</textarea>
      <div class="librarian__row">
        <span id="librarian-count">${state.question.length} / 600</span>
        <button class="label label--small label--filled" type="submit" ${state.asking ? 'disabled' : ''}>Ask</button>
      </div>
    </form>
    ${state.error ? `<p class="librarian__error" role="alert">${escapeHtml(state.error)}</p>` : ''}
    ${waiting}
    <p class="librarian__note">The librarian only answers questions about regenerative design and this map,
      and only from what is in the library.</p>`;
  open();
  if (drawer.isSheet()) drawer.setSheet('open');
  if (focus && !state.asking) {
    const field = document.getElementById('librarian-question');
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  }
}

function showAnswer() {
  const { answer } = state;
  if (!answer) return showAsk();
  state.view = 'answer';
  setHead('The librarian');
  const groups = groupsOf(answer);

  panelBody.innerHTML = `
    <p class="panel__meta librarian__question">${escapeHtml(answer.question)}</p>
    ${answer.reply ? `<p class="librarian__reply">${escapeHtml(answer.reply)}</p>` : ''}
    ${groups
      .map(
        (group) => `
      <section class="librarian__group">
        <h4><a href="#" data-open="${escapeHtml(group.id)}" style="--wash: ${map.washOf(group.id) ?? 'var(--ink)'}">${blotMark(group.id)}${escapeHtml(group.title)}</a></h4>
        <p class="librarian__reasoning">${escapeHtml(group.reasoning)}</p>
        <ul class="panel__links">${group.sources.map(threadRow).join('')}</ul>
      </section>`,
      )
      .join('')}
    <p class="librarian__actions">
      <button class="label label--small" type="button" data-again>This isn't quite right, I'd like to search again</button>
      ${groups.length ? '<button class="label label--small label--filled" type="button" data-print>Print</button>' : ''}
    </p>
    ${
      answer.by === 'keywords'
        ? '<p class="librarian__note">Answered by keyword only: the librarian’s reading model is not connected on this copy of the Atlas.</p>'
        : ''
    }`;
  open();
}

/** One theme of the answer, opened from the map. */
function showGroup(node) {
  const group = groupsOf(state.answer).find((g) => g.id === node.id);
  if (!group) return;
  state.view = 'group';
  setHead(group.title, blotMark(group.id), map.washOf(group.id));
  panelBody.innerHTML = `
    <p class="panel__meta">${group.sources.length} ${group.sources.length === 1 ? 'piece' : 'pieces'} of research</p>
    <p class="panel__summary">${escapeHtml(group.reasoning)}</p>
    <ul class="panel__links">${group.sources.map(threadRow).join('')}</ul>
    <p class="librarian__actions"><button class="label label--small" type="button" data-back>Back to the whole answer</button></p>`;
  open();
}

/** One piece of research, as the record it is on Explore. */
function showRecord(node) {
  state.view = 'record';
  setHead(node.label, CROSSHAIR, null);
  panel.style.setProperty('--head-ink', 'var(--paper)');
  const placedIn = groupsOf(state.answer).filter((group) => group.sources.some((s) => s.id === node.id));
  panelBody.innerHTML = `
    <p class="panel__meta">${escapeHtml(citationLine(node)) || escapeHtml(hostOf(node.url))}</p>
    ${node.summary ? `<p class="panel__summary">${escapeHtml(node.summary)}</p>` : ''}
    ${node.note ? `<p class="record__note">${escapeHtml(node.note)}</p>` : ''}
    <p class="panel__actions">
      <a class="label label--small" href="${escapeHtml(node.url)}" target="_blank" rel="noopener noreferrer">Read the source ↗</a>
      <a class="label label--small" href="/map/?open=${encodeURIComponent(node.id)}">Find it on the map</a>
    </p>
    ${
      placedIn.length
        ? `<h4>Why it is here</h4>${placedIn
            .map(
              (group) =>
                `<p class="librarian__reasoning"><b>${escapeHtml(group.title)}.</b> ${escapeHtml(group.reasoning)}</p>`,
            )
            .join('')}`
        : ''
    }
    <p class="librarian__actions"><button class="label label--small" type="button" data-back>Back to the whole answer</button></p>`;
  open();
}

function renderLegend() {
  const groups = groupsOf(state.answer);
  if (!state.answer || groups.length === 0) {
    legend.innerHTML = `<span class="map-legend__text">Tell the librarian what you are exploring,
      and the map will draw what the library holds on it.</span>`;
    return;
  }
  const count = new Set(groups.flatMap((group) => group.sources.map((s) => s.id))).size;
  legend.innerHTML = `<span class="map-legend__text"><b>${count}</b> ${count === 1 ? 'piece' : 'pieces'} of research
    in <b>${groups.length}</b> ${groups.length === 1 ? 'theme' : 'themes'}.<br>
    <span style="opacity:.75">Open a point to read it, or a theme to see why it was chosen.</span></span>`;
}

/* --- asking ---------------------------------------------------------------- */

async function ask(question) {
  state.question = question;
  state.error = '';
  state.asking = true;
  showAsk({ focus: false });
  try {
    if (!state.library) state.library = await api.graph({});
    const answer = await api.librarian(question);
    state.answer = answer;
    state.asking = false;
    map.setGraph(graphOf(answer));
    renderLegend();
    showAnswer();
    // On a phone the answer arrives as a preview — the question — so the
    // constellation it drew has the screen; the rest is a pull away.
    if (drawer.isSheet() && groupsOf(answer).length) drawer.setSheet('peek');
  } catch (error) {
    state.asking = false;
    state.error = error.message;
    showAsk();
  }
}

/** Back to the form, with the question still in it, and the map cleared. */
function askAgain() {
  state.answer = null;
  map.setGraph(EMPTY);
  renderLegend();
  showAsk();
}

/* --- on paper ----------------------------------------------------------------
   The whole drawer, as a document: the question, the librarian's reading of
   it, the constellation, and each theme with its reasoning and its research. */

const fileName = (question) =>
  `regenerative-atlas-librarian-${String(question)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'answer'}.pdf`;

function printAnswer() {
  const { answer } = state;
  if (!answer) return;
  const groups = groupsOf(answer);
  const sheet = new Sheet({ size: A4 });

  sheet.text('THE LIBRARIAN · REGENERATIVE ATLAS', { size: 7.5, grey: 0.4 });
  sheet.space(3);
  sheet.text(answer.question, { font: 'serif', size: 18, leading: 1.2 });
  sheet.rule({ gap: 6 });
  sheet.space(8);
  if (answer.reply) {
    sheet.text(answer.reply, { font: 'serif', size: 11, leading: 1.5, grey: 0.1 });
    sheet.space(8);
  }

  printGraph(sheet, map.trace?.(), { frame: WIDE_FRAME, dotted: true, names: 1.5 });

  groups.forEach((group) => {
    sheet.reserve(60);
    sheet.text(group.title.toUpperCase(), { size: 7.5, grey: 0.4 });
    sheet.rule({ grey: 0.75, gap: 2 });
    sheet.space(5);
    sheet.text(group.reasoning, { font: 'serif', size: 10.5, leading: 1.45, grey: 0.15 });
    sheet.space(6);
    group.sources.forEach((source, index) => {
      sheet.reserve(34);
      sheet.text(`${index + 1}.  ${source.label}`, { size: 10.5 });
      const cited = citationLine(source);
      if (cited) sheet.text(cited, { size: 9, grey: 0.25, indent: 14 });
      if (source.url) sheet.text(source.url, { size: 8.5, grey: 0.45, indent: 14 });
      sheet.space(6);
    });
    sheet.space(6);
  });

  sheet.space(6);
  sheet.rule({ gap: 2 });
  sheet.space(4);
  const where = /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(location.hostname) ? '' : `  ·  ${location.host}`;
  sheet.text(`Drawn by the librarian of the Regenerative Atlas on ${WHEN()}${where}`, { size: 7.5, grey: 0.4 });
  sheet.text(
    answer.by === 'keywords'
      ? 'Read by keyword. Bibliographic records are shared under CC0; the linked works remain with their authors.'
      : 'Grouped by a language model from the library alone; read the sources themselves before relying on them. ' +
          'Bibliographic records are shared under CC0; the linked works remain with their authors.',
    { size: 7.5, grey: 0.4 },
  );

  hand(fileName(answer.question), toBlob(sheet));
}

/* --- events ---------------------------------------------------------------- */

document.addEventListener('submit', (event) => {
  if (event.target.id !== 'librarian-form') return;
  event.preventDefault();
  const question = document.getElementById('librarian-question').value.trim();
  if (!question) {
    state.error = 'Write a sentence or two about what you are exploring first.';
    showAsk();
    return;
  }
  ask(question);
});

document.addEventListener('input', (event) => {
  if (event.target.id !== 'librarian-question') return;
  state.question = event.target.value;
  document.getElementById('librarian-count').textContent = `${event.target.value.length} / 600`;
});

// Enter asks; Shift+Enter is a new line, as in any message box.
document.addEventListener('keydown', (event) => {
  if (event.target.id === 'librarian-question' && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    event.target.form.requestSubmit();
  }
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-again]')) {
    event.preventDefault();
    askAgain();
    return;
  }
  if (event.target.closest('[data-print]')) {
    event.preventDefault();
    printAnswer();
    return;
  }
  if (event.target.closest('[data-back]')) {
    event.preventDefault();
    if (map.opened?.()) map.reset();
    else showAnswer();
    return;
  }
  const openLink = event.target.closest('[data-open]');
  if (openLink) {
    event.preventDefault();
    map.open(openLink.dataset.open);
  }
});

// Running down the drawer points at the map.
const pointAt = (event) => {
  const row = event.target.closest?.('[data-open]');
  map.highlight(row ? row.dataset.open : null);
};
panelBody.addEventListener('pointerover', pointAt);
panelBody.addEventListener('focusin', pointAt);
panelBody.addEventListener('pointerleave', () => map.highlight(null));

toggle.addEventListener('click', () => {
  if (panel.classList.contains('is-open')) {
    drawer.close();
    return;
  }
  if (state.answer) showAnswer();
  else showAsk();
});

document.getElementById('panel-close').addEventListener('click', () => {
  drawer.close();
  if (map.opened?.()) map.reset();
});

document.getElementById('map-reset').addEventListener('click', () => map.reset());
document.getElementById('map-in').addEventListener('click', () => map.zoomBy(1.4));
document.getElementById('map-out').addEventListener('click', () => map.zoomBy(1 / 1.4));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (map.opened?.()) map.reset();
  else drawer.close();
});

/* --- arriving -------------------------------------------------------------- */

map.setGraph(EMPTY);
renderLegend();
fillCount();
showAsk();
// Fetched now, so the first answer has nothing left to wait for but itself.
api
  .graph({})
  .then((graph) => {
    state.library = graph;
  })
  .catch(() => {});
