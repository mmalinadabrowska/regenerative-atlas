/**
 * The curator's page: one submission, and a decision about it — or, from the
 * count of what is waiting, the list of every entry still to be decided.
 *
 * Reached only from the link in the notification email. That link's token
 * opens its own entry and the list of those still waiting, each of which has
 * a page of its own; it cannot touch the library. It reads and sends answers.
 *
 * The decision is a POST rather than a link, which is why this page exists at
 * all: a message in an inbox gets opened by scanners, previewers and prefetch,
 * and an entry should never be accepted by something merely looking at the
 * email it arrived in.
 */

import { api, citationLine, escapeHtml, hostOf } from './api.js';

const panel = document.getElementById('review');
const waitingLine = document.querySelector('[data-waiting]');
const heading = document.querySelector('[data-heading]');
const blurb = document.querySelector('[data-blurb]');
const query = new URLSearchParams(location.search);
const token = query.get('token') ?? '';
const listing = query.has('queue');

/** The list of everything waiting, opened with this page's own link. */
const queueHref = () => `/review/?token=${encodeURIComponent(token)}&queue`;

/** The count in the bar, as the way to the list — or nothing, when nothing waits. */
function showWaiting(count) {
  if (!waitingLine) return;
  waitingLine.hidden = !count;
  waitingLine.textContent = count ? `${count} waiting` : '';
  waitingLine.href = queueHref();
}

/** "N more waiting", said as a link to them. */
const moreWaiting = (count) =>
  count
    ? `<a href="${queueHref()}">${count} more waiting</a>.`
    : 'Nothing else is waiting.';

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

/**
 * A tag the contributor coined arrives as "material:cork" — the facet it was
 * added under, then the word. Said as the word, marked as new, because that is
 * the thing a curator most wants to notice before accepting it.
 */
const coined = (slug) => /^([a-z]+):(.+)$/.exec(slug);
const labelOf = (slug) => {
  const own = coined(slug);
  if (own) return `${own[2].replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())} (new ${own[1]})`;
  return labels.get(slug)?.label ?? slug;
};
const facetOf = (slug) => (coined(slug) ? coined(slug)[1] : (labels.get(slug)?.facet ?? 'open'));

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
        ? `<p class="review__status">This one was ${entry.status} already.</p>
           <p class="review__caveat"><a href="${queueHref()}">See what is still waiting</a>.</p>`
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
      <p class="review__caveat">${moreWaiting(result.waiting)}</p>`;
    showWaiting(result.waiting);
  } catch (error) {
    say(escapeHtml(error.message), 'bad');
  }
}

/** Every entry still waiting, oldest first, each the way to its own page. */
function renderQueue(queue) {
  heading.textContent = 'Waiting for you';
  blurb.textContent = queue.length
    ? 'Everything sent in and not yet decided, oldest first. Open one to read it and decide.'
    : 'Nothing is waiting. Every entry sent in has been decided.';
  document.title = 'Waiting · Regenerative Atlas';
  if (!queue.length) {
    panel.innerHTML = '';
    return;
  }
  panel.innerHTML = `<ol class="review__queue">${queue
    .map((entry) => {
      const line = citationLine(entry);
      const sent = entry.submittedAt
        ? new Date(entry.submittedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
      return `<li>
        <a class="review__item" href="/review/?token=${encodeURIComponent(entry.token)}">
          <span class="review__item-title">${escapeHtml(entry.title)}</span>
          ${line ? `<span class="review__cite">${escapeHtml(line)}</span>` : ''}
          <span class="review__by">${entry.contributor ? `Sent in by ${escapeHtml(entry.contributor)}` : 'Sent in anonymously'}${
        sent ? ` · ${sent}` : ''
      } · ${escapeHtml(hostOf(entry.url))}</span>
        </a>
      </li>`;
    })
    .join('')}</ol>`;
}

if (!token) {
  say('This page needs the link from the notification — it is the only thing that says which entry you mean.', 'bad');
} else if (listing) {
  try {
    const { queue, waiting } = await api.reviewQueue(token);
    showWaiting(waiting);
    renderQueue(queue);
  } catch (error) {
    say(escapeHtml(error.message), 'bad');
  }
} else {
  await loadLabels();
  try {
    const { entry, waiting } = await api.review(token);
    showWaiting(waiting);
    render(entry);
  } catch (error) {
    say(escapeHtml(error.message), 'bad');
  }
}
