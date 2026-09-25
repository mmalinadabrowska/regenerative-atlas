/**
 * The curator's page: one submission, and a decision about it.
 *
 * Reached only from the link in the notification email, and holding only what
 * that link's token opens — this page cannot list the queue, cannot see any
 * other entry, and cannot touch the library. It reads one record and sends one
 * answer back.
 *
 * The decision is a POST rather than a link, which is why this page exists at
 * all: a message in an inbox gets opened by scanners, previewers and prefetch,
 * and an entry should never be accepted by something merely looking at the
 * email it arrived in.
 */

import { api, citationLine, escapeHtml, hostOf } from './api.js';

const panel = document.getElementById('review');
const waitingLine = document.querySelector('[data-waiting]');
const token = new URLSearchParams(location.search).get('token') ?? '';

let labels = new Map();

const say = (html, tone = '') =>
  (panel.innerHTML = `<p class="review__status${tone ? ` is-${tone}` : ''}">${html}</p>`);

/** The vocabulary's own words for a slug, where the baked copy has them. */
async function loadLabels() {
  try {
    const vocabulary = await api.vocabulary();
    labels = new Map((vocabulary.tags ?? []).map((tag) => [tag.slug, tag]));
  } catch {
    /* Slugs read well enough on their own; this is a courtesy, not a dependency. */
  }
}

const labelOf = (slug) => labels.get(slug)?.label ?? slug;
const facetOf = (slug) => labels.get(slug)?.facet ?? 'open';

function chips(slugs) {
  const places = slugs.filter((slug) => facetOf(slug) === 'location');
  const themes = slugs.filter((slug) => facetOf(slug) !== 'location');
  const row = (heading, list) =>
    list.length
      ? `<div class="review__tags">
           <h3>${heading}</h3>
           <ul>${list.map((slug) => `<li class="chip">${escapeHtml(labelOf(slug))}</li>`).join('')}</ul>
         </div>`
      : '';
  return row('Tagged', themes) + row('Grounded in', places);
}

function render(entry) {
  const line = citationLine(entry);
  const decided = entry.status !== 'pending';

  panel.innerHTML = `
    <article class="review__entry">
      <h2>${escapeHtml(entry.title)}</h2>
      ${line ? `<p class="review__cite">${escapeHtml(line)}</p>` : ''}
      <p class="review__link">
        <a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(hostOf(entry.url))}</a>
      </p>

      ${entry.summary ? `<p class="review__prose">${escapeHtml(entry.summary).replace(/\n+/g, '<br>')}</p>` : ''}
      ${
        entry.note
          ? `<div class="review__note">
               <h3>Why it belongs</h3>
               <p>${escapeHtml(entry.note).replace(/\n+/g, '<br>')}</p>
             </div>`
          : ''
      }

      ${chips(entry.tags ?? [])}

      <p class="review__by">${
        entry.contributor ? `Sent in by ${escapeHtml(entry.contributor)}` : 'Sent in anonymously'
      }${entry.submittedAt ? ` · ${new Date(entry.submittedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</p>
    </article>

    ${
      decided
        ? `<p class="review__status">This one was ${entry.status} already.</p>`
        : `<div class="review__decide">
             <button class="label label--filled" data-decide="accept">Add it to the Atlas</button>
             <button class="label" data-decide="decline">Leave it out</button>
           </div>
           <p class="review__caveat">Accepting writes it into the library the Atlas keeps. It appears on
             the map at the next publish.</p>`
    }`;

  for (const button of panel.querySelectorAll('[data-decide]')) {
    button.addEventListener('click', () => decide(button.dataset.decide, entry));
  }
}

async function decide(decision, entry) {
  for (const button of panel.querySelectorAll('[data-decide]')) button.disabled = true;
  try {
    const result = await api.decide(token, decision);
    panel.innerHTML = `
      <article class="review__entry">
        <h2>${escapeHtml(entry.title)}</h2>
        <p class="review__status is-good">${
          result.decision === 'accept'
            ? 'In. It is in the library now, and on the map at the next publish.'
            : 'Left out. Nothing was written, and the person who sent it is not told either way.'
        }</p>
      </article>
      <p class="review__caveat">${
        result.waiting ? `${result.waiting} more waiting.` : 'Nothing else is waiting.'
      }</p>`;
    if (waitingLine) waitingLine.textContent = result.waiting ? `${result.waiting} waiting` : '';
  } catch (error) {
    say(escapeHtml(error.message), 'bad');
  }
}

if (!token) {
  say('This page needs the link from the notification — it is the only thing that says which entry you mean.', 'bad');
} else {
  await loadLabels();
  try {
    const { entry, waiting } = await api.review(token);
    if (waitingLine) waitingLine.textContent = waiting ? `${waiting} waiting` : '';
    render(entry);
  } catch (error) {
    say(escapeHtml(error.message), 'bad');
  }
}
