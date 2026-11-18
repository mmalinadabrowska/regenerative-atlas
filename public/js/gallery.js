/**
 * The gallery: pictures of the research on an island, shown when a pointer
 * rests on its blot.
 *
 * A moment's rest, not a pass: the map is crossed constantly on the way to
 * somewhere else, and a gallery that sprang up under every blot the pointer
 * touched would be noise. After a couple of seconds on one, its research comes
 * up above it as a stack of dithered pictures, each named — the front one
 * whole, the rest fanned out behind it. Running along the line beneath, or
 * the wheel, or the arrow keys, brings the next forward; pressing the one in
 * front opens it, which is the next view of the map.
 *
 * Only for a pointer that can rest. A touch screen has no hover, and its
 * islands open on a tap as they always have.
 */

import { escapeHtml } from './api.js';
import { ditheredPicture } from './dither.js';

const DELAY_MS = 1600;
const LINGER_MS = 420;
const CARD = { width: 216, height: 158 };
const MOST = 12;

export function createGallery({ host, canvas, map, sourcesOf, open, nameOf = (node) => node.label }) {
  const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
  const el = document.createElement('div');
  el.className = 'gallery';
  el.hidden = true;
  el.setAttribute('role', 'region');
  el.tabIndex = -1;
  host.append(el);

  let waiting = null;
  let leaving = null;
  let current = null; // the island the gallery is showing, or the one it is about to
  let shown = false;
  let items = [];
  let index = 0;
  let ticket = 0;

  function hover(node) {
    if (!canHover) return;
    clearTimeout(waiting);
    if (node?.type === 'tag') {
      if (shown && current?.id === node.id) {
        clearTimeout(leaving);
        return;
      }
      waiting = setTimeout(() => show(node), DELAY_MS);
      return;
    }
    if (shown) linger();
  }

  function linger() {
    clearTimeout(leaving);
    leaving = setTimeout(hide, LINGER_MS);
  }

  function hide() {
    clearTimeout(waiting);
    clearTimeout(leaving);
    ticket += 1;
    shown = false;
    current = null;
    items = [];
    el.hidden = true;
    el.classList.remove('is-shown');
  }

  function show(node) {
    const mine = ++ticket;
    const sources = sourcesOf(node).slice(0, MOST);
    current = node;
    items = [];
    index = 0;
    // Shown as the pictures arrive, in the order the island lists its research,
    // and only once there is one: an island whose research has no pictures
    // shows nothing at all, rather than an empty frame.
    sources.forEach((source, order) => {
      ditheredPicture(source.url, CARD.width, CARD.height).then((picture) => {
        if (mine !== ticket || !picture) return;
        items.push({ source, picture, order });
        items.sort((a, b) => a.order - b.order);
        if (!shown) {
          shown = true;
          el.hidden = false;
          el.setAttribute('aria-label', `Pictures of the research filed under ${nameOf(node)}`);
          render();
          place();
          requestAnimationFrame(() => el.classList.add('is-shown'));
        } else {
          render();
        }
      });
    });
  }

  /** Above the blot, clear of it; below it when there is no room above. */
  function place() {
    const at = current && map.screenOf(current.id);
    if (!at) return hide();
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const room = host.getBoundingClientRect();
    const left = Math.min(Math.max(at.x - CARD.width / 2, 12), room.width - width - 12);
    let top = at.y - at.r - height - 14;
    if (top < 12) top = at.y + at.r + 14;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  /** How far each card behind the front one stands out, as a share of a card. */
  const FAN = [0, 0.52, 0.72, 0.92];

  function render() {
    const count = items.length;
    // As wide as the cards it is showing, so the line under them ends where
    // they do.
    const behind = Math.min(count - 1 - index, FAN.length - 1);
    el.style.width = `${Math.round(CARD.width * (1 + FAN[behind]))}px`;
    el.innerHTML = `
      <div class="gallery__stack" style="--count:${Math.min(count - index, 4)}">
        ${items
          .map((item, i) => {
            const depth = i - index;
            const place = depth < 0 ? 'gone' : depth > 3 ? 'away' : String(depth);
            const label = escapeHtml(item.source.label);
            return `<button class="gallery__card" type="button" data-at="${i}" data-depth="${place}"
                      ${depth === 0 ? '' : 'tabindex="-1"'}
                      aria-label="${depth === 0 ? `Open ${label}` : `Bring forward ${label}`}">
                      <span class="gallery__name">${label}</span>
                      <span class="gallery__picture" data-picture="${i}"></span>
                    </button>`;
          })
          .join('')}
      </div>
      <div class="gallery__track" role="slider" tabindex="0" aria-label="Browse the pictures"
           aria-valuemin="1" aria-valuemax="${count}" aria-valuenow="${index + 1}"
           aria-valuetext="${index + 1} of ${count}: ${escapeHtml(items[index]?.source.label ?? '')}">
        <span class="gallery__line"></span>
        <span class="gallery__dot" style="--at:${count > 1 ? index / (count - 1) : 0}"></span>
      </div>
      <p class="gallery__note">${escapeHtml(annotation(items[index]?.source))}<span>${index + 1} of ${count}</span></p>`;
    for (const slot of el.querySelectorAll('[data-picture]')) {
      slot.append(items[Number(slot.dataset.picture)].picture);
    }
  }

  /** The line under the pictures: what the one in front is, in a few words. */
  const annotation = (source) =>
    source ? [source.publisher || source.authors, source.year].filter(Boolean).join(' · ') : '';

  function go(next) {
    const bounded = Math.min(Math.max(next, 0), items.length - 1);
    if (bounded === index) return;
    index = bounded;
    render();
  }

  el.addEventListener('pointerenter', () => clearTimeout(leaving));
  el.addEventListener('pointerleave', linger);

  el.addEventListener('click', (event) => {
    const card = event.target.closest('.gallery__card');
    if (!card) return;
    const at = Number(card.dataset.at);
    if (at !== index) return go(at);
    const { source } = items[at];
    hide();
    open(source);
  });

  el.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 4) return;
      go(index + Math.sign(delta));
    },
    { passive: false },
  );

  // Running along the line: the dot follows the pointer, and the picture in
  // front is the one it is over.
  let scrubbing = false;
  const scrubTo = (event) => {
    const line = el.querySelector('.gallery__line')?.getBoundingClientRect();
    if (!line || items.length < 2) return;
    const t = Math.min(Math.max((event.clientX - line.left) / line.width, 0), 1);
    go(Math.round(t * (items.length - 1)));
  };
  el.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.gallery__track')) return;
    scrubbing = true;
    el.setPointerCapture?.(event.pointerId);
    scrubTo(event);
  });
  el.addEventListener('pointermove', (event) => {
    if (scrubbing || event.target.closest('.gallery__track')) scrubTo(event);
  });
  el.addEventListener('pointerup', () => {
    scrubbing = false;
  });

  el.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') go(index + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') go(index - 1);
    else if (event.key === 'Escape') hide();
    else return;
    event.preventDefault();
  });

  // Anything else that moves the map takes the gallery with it.
  canvas.addEventListener('pointerdown', hide);
  canvas.addEventListener('wheel', hide, { passive: true });
  window.addEventListener('resize', hide);

  return { hover, hide };
}
