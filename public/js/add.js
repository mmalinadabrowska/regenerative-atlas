/**
 * Wiring for /add.
 *
 * The whole point is that contributing costs one paste. The link goes to the
 * server, which reads the page (or the DOI) and hands back a filled form and a
 * few suggested tags; the contributor's job is only to correct and to say where
 * the piece sits.
 */

import { api, escapeHtml, fillCount } from './api.js';

const lookupForm = document.getElementById('lookup-form');
const lookupButton = document.getElementById('lookup-button');
const lookupStatus = document.getElementById('lookup-status');
const urlInput = document.getElementById('url');
const recordForm = document.getElementById('record-form');
const notice = document.getElementById('notice');
const suggestedBox = document.getElementById('suggested');
const chosenBox = document.getElementById('chosen-tags');
const vocabularyBox = document.getElementById('vocabulary');
const freeTagInput = document.getElementById('free-tag');
const tagOptions = document.getElementById('tag-options');
const submitButton = document.getElementById('submit-button');
const freeTagHint = document.getElementById('free-tag-hint');
const FREE_TAG_HINT = freeTagHint.textContent;

const chosen = new Set();
let vocabulary = { facets: [], tags: [] };

/** Loose key for comparing what someone typed against the vocabulary. */
const loose = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Mirrors slugify() in server/vocabulary.js, which stays the authority. */
const slugify = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

/** The continent a country sits in, or null for anything that is not a country. */
const regionOf = (slug) => vocabulary.tags.find((t) => t.slug === slug)?.within ?? null;

/** The facets a contributor can coin a tag in, from the box at the end of each. */
const COINABLE = new Set(['material', 'method', 'format']);

/**
 * A tag coined in one of those facets travels as "material:cork", so it is
 * filed among the materials rather than the open tags. Null for anything else.
 */
const coined = (slug) => /^([a-z]+):(.+)$/.exec(slug);

/**
 * Fold a written tag onto the vocabulary's own name for it, so the chip says
 * what will actually be stored. The server canonicalises again on submit and
 * remains the authority; this only spares the contributor the surprise.
 * Returns { slug, foldedFrom } — foldedFrom is set when the name changed.
 */
function canonicalise(written) {
  const key = loose(written);
  if (!key) return null;

  const exact = vocabulary.tags.find((t) => loose(t.slug) === key || loose(t.label) === key);
  if (exact) return { slug: exact.slug, foldedFrom: null };

  for (const [slug, forms] of Object.entries(vocabulary.aliases ?? {})) {
    if (forms.some((form) => loose(form) === key)) return { slug, foldedFrom: written };
  }
  return { slug: slugify(written), foldedFrom: null };
}

const titled = (slug) => slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

const labelOf = (slug) =>
  vocabulary.tags.find((t) => t.slug === slug)?.label ?? titled(coined(slug)?.[2] ?? slug);

function say(message, tone = '') {
  notice.innerHTML = message
    ? `<p class="notice${tone ? ` notice--${tone}` : ''}">${message}</p>`
    : '';
  if (message) notice.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* --- tags --------------------------------------------------------------- */

function renderChosen() {
  chosenBox.innerHTML = chosen.size
    ? [...chosen]
        .map(
          (slug) => `<button class="tag is-on" type="button" data-drop="${escapeHtml(slug)}">
            ${escapeHtml(labelOf(slug))} <span aria-hidden="true">×</span>
            <span class="visually-hidden">remove</span></button>`,
        )
        .join('')
    : '<p class="field__hint" style="margin:0">No tags yet — pick from below or write your own.</p>';

  for (const button of vocabularyBox.querySelectorAll('[data-pick]')) {
    button.classList.toggle('is-on', chosen.has(button.dataset.pick));
  }
}

/**
 * A country brings its continent with it, as the server would anyway: the
 * continent is what the map filters by, so it is shown chosen here too rather
 * than turning up unannounced on the record.
 */
function addTag(slug) {
  if (!slug) return;
  const adding = [slug, regionOf(slug)].filter((s) => s && !chosen.has(s));
  if (chosen.size + adding.length > 12) {
    say('Twelve tags is the limit — a source that is about everything is about nothing.', 'bad');
    return;
  }
  for (const s of adding) chosen.add(s);
  renderChosen();
}

/** Countries by continent, for the list under the location chips. */
function countryPicker() {
  const regions = vocabulary.tags.filter((t) => t.facet === 'location' && !t.within);
  const groups = regions
    .map((region) => {
      const countries = vocabulary.tags
        .filter((t) => t.within === region.slug)
        .sort((a, b) => a.label.localeCompare(b.label));
      if (countries.length === 0) return '';
      return `<optgroup label="${escapeHtml(region.label)}">${countries
        .map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.label)}</option>`)
        .join('')}</optgroup>`;
    })
    .join('');
  return `<label class="field country-field"><span>Country</span>
      <select id="country" data-country>
        <option value="">Add a country…</option>${groups}
      </select>
      <p class="field__hint">Optional. The country is shown on the record; the map filters by its continent.</p>
    </label>`;
}

/** A box at the end of a facet's chips for a tag the vocabulary has not got yet. */
const ownTagBox = (facet) =>
  `<label class="tag tag--ghost tag--own">
     <span class="visually-hidden">Add your own ${escapeHtml(facet.label.toLowerCase())} tag</span>
     <input type="text" id="own-${escapeHtml(facet.key)}" data-own="${escapeHtml(facet.key)}"
       maxlength="40" autocomplete="off" placeholder="+ Add your own">
   </label>`;

async function renderVocabulary() {
  vocabulary = await api.vocabulary();
  vocabularyBox.innerHTML = vocabulary.facets
    .map((facet) => {
      const tags = vocabulary.tags.filter((t) => t.facet === facet.key && !t.within);
      if (tags.length === 0) return '';
      return `<div class="section-head" style="margin-top:1.5rem">
          <h2 style="font-size:1.1rem">${escapeHtml(facet.label)}</h2>
          <p>${escapeHtml(facet.ask ?? facet.note)}</p>
        </div>
        <div class="tag-cloud">${tags
          .map(
            (tag) => `<button class="tag" type="button" data-pick="${escapeHtml(tag.slug)}"
              title="${escapeHtml(tag.note ?? '')}">${escapeHtml(tag.label)}</button>`,
          )
          .join('')}${COINABLE.has(facet.key) ? ownTagBox(facet) : ''}</div>
        ${facet.key === 'location' ? countryPicker() : ''}`;
    })
    .join('');
  tagOptions.innerHTML = vocabulary.tags
    .filter((tag) => !tag.within)
    .map((tag) => `<option value="${escapeHtml(tag.label)}"></option>`)
    .join('');
}

/* --- lookup ------------------------------------------------------------- */

lookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  lookupButton.disabled = true;
  lookupStatus.textContent = 'Reading the link…';
  say('');

  try {
    const found = await api.describe(url);

    if (found.alreadyInAtlas) {
      say(
        `That one is already here — <a href="/themes/?q=${encodeURIComponent(found.alreadyInAtlas.title)}">${escapeHtml(found.alreadyInAtlas.title)}</a>.
         Adding it again will fold your tags into the existing record rather than making a second node.`,
        'good',
      );
    }

    recordForm.hidden = false;
    recordForm.elements.title.value = found.title ?? '';
    recordForm.elements.authors.value = found.authors ?? '';
    recordForm.elements.publisher.value = found.publisher ?? '';
    recordForm.elements.year.value = found.year ?? '';
    // The summary is left empty on purpose. What a page says about itself is a
    // publisher's blurb, and a library of blurbs tells you nothing about which
    // of them to read; the one sentence worth having is the one written by
    // somebody who read it. The scraped text still does its other job on the
    // server, where the tag suggestions are drawn from it.
    recordForm.elements.summary.value = '';

    lookupStatus.textContent =
      found.via === 'doi'
        ? 'Found through the DOI — this should be accurate.'
        : found.via === 'page'
          ? 'Read from the page. Check it, publishers are careless with metadata.'
          : 'That link would not tell us anything about itself, so fill it in by hand.';

    const suggested = found.suggestedTags ?? [];
    suggestedBox.innerHTML = suggested.length
      ? `<p class="field__hint" style="margin-top:0">Suggested from the text:</p>
         <div class="tag-cloud" style="margin-bottom:1rem">${suggested
           .map(
             (slug) => `<button class="tag tag--ghost" type="button" data-pick="${escapeHtml(slug)}">
               + ${escapeHtml(labelOf(slug))}</button>`,
           )
           .join('')}</div>`
      : '';

    if (!recordForm.elements.title.value) recordForm.elements.title.focus();
  } catch (error) {
    recordForm.hidden = false;
    lookupStatus.textContent = 'Fill the record in by hand below.';
    say(escapeHtml(error.message), 'bad');
  } finally {
    lookupButton.disabled = false;
  }
});

/* --- tag picking -------------------------------------------------------- */

document.addEventListener('click', (event) => {
  const pick = event.target.closest('[data-pick]');
  if (pick) {
    event.preventDefault();
    addTag(pick.dataset.pick);
    return;
  }
  const drop = event.target.closest('[data-drop]');
  if (drop) {
    event.preventDefault();
    chosen.delete(drop.dataset.drop);
    renderChosen();
  }
});

freeTagInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ',') return;
  event.preventDefault();
  const written = freeTagInput.value.trim();
  if (!written) return;

  const resolved = canonicalise(written);
  if (!resolved) return;
  addTag(resolved.slug);
  freeTagInput.value = '';

  freeTagHint.textContent = resolved.foldedFrom
    ? `“${resolved.foldedFrom}” is already in the vocabulary as ${labelOf(resolved.slug)}.`
    : FREE_TAG_HINT;
});

vocabularyBox.addEventListener('change', (event) => {
  const picker = event.target.closest('[data-country]');
  if (!picker || !picker.value) return;
  addTag(picker.value);
  picker.value = '';
});

/**
 * A tag coined among the materials, methods or formats. If the vocabulary has
 * the word already — under any facet — that is the tag, as it would be from the
 * box above; only a word it has not got is coined, and it is coined where it
 * was written.
 */
vocabularyBox.addEventListener('keydown', (event) => {
  const box = event.target.closest('[data-own]');
  if (!box || (event.key !== 'Enter' && event.key !== ',')) return;
  event.preventDefault();
  const written = box.value.trim();
  if (!written) return;
  const resolved = canonicalise(written);
  if (!resolved?.slug) return;
  const known = vocabulary.tags.some((t) => t.slug === resolved.slug);
  addTag(known ? resolved.slug : `${box.dataset.own}:${resolved.slug}`);
  box.value = '';
});

/* --- submit ------------------------------------------------------------- */

recordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (chosen.size === 0) {
    say('Add at least one tag, so the source has somewhere to sit on the map.', 'bad');
    return;
  }

  submitButton.disabled = true;
  const data = Object.fromEntries(new FormData(recordForm));

  try {
    const result = await api.submit({
      ...data,
      url: urlInput.value.trim(),
      tags: [...chosen],
    });

    // Two Atlases answer this form and they answer it differently. On the web
    // an entry is queued: it goes to the curator, who decides, because the
    // library is curated and this form is open to anyone. On the curator's own
    // machine there is nobody to ask, and it is simply added. The wording
    // follows whichever happened rather than promising one and doing the other.
    if (result.alreadyInAtlas) {
      say(
        `That one is already on the map —
         <a href="/map/?q=${encodeURIComponent(result.alreadyInAtlas.title)}">go and see it</a>.
         Two people finding the same work is a signal in itself.`,
        'good',
      );
    } else if (result.alreadyWaiting) {
      say('Somebody sent this one in already — it is with the curator, waiting to be read.', 'good');
    } else if (result.queued) {
      say(
        `Thank you — it is now with the curator. The entry doesn’t reach the map until it is verified,
         and you will find it there once it’s been checked.`,
        'good',
      );
    } else {
      const { source, created } = result;
      say(
        `${created ? 'Added to the Atlas' : 'Folded into the record already there'} —
         <a href="/map/?q=${encodeURIComponent(source.title)}">see it on the map</a>,
         or <a href="/themes/?tag=${encodeURIComponent(source.tags[0]?.slug ?? '')}">browse its neighbours</a>.`,
        'good',
      );
    }

    recordForm.reset();
    recordForm.hidden = true;
    suggestedBox.innerHTML = '';
    urlInput.value = '';
    chosen.clear();
    renderChosen();
    lookupStatus.textContent = 'Send another.';
    fillCount();
  } catch (error) {
    say(escapeHtml(error.message), 'bad');
  } finally {
    submitButton.disabled = false;
  }
});

fillCount();

// Without the vocabulary there is nothing to tag with, so say so rather than
// leaving the page half-built.
try {
  await renderVocabulary();
} catch (error) {
  say(`The tag vocabulary could not be loaded. ${escapeHtml(error.message)}`, 'bad');
}
renderChosen();
