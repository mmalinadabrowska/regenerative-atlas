/**
 * The strip: on a phone, a row of small pictures along the bottom of the map,
 * one for each piece of research the map is showing.
 *
 * A phone has no pointer to rest on a blot, so the gallery never comes up
 * there; this is the same pictures, offered the way a phone is used — a
 * row you run your thumb along, and a tap on one opens it. It follows the
 * map: all of the research on the islands, what is filed under a theme once
 * the theme is open, and a piece of research among the ones it sits beside.
 *
 * Pictures are fetched only as they scroll into view, because a phone on a
 * slow connection should not pay for fifty pictures to look at three.
 */

import { escapeHtml } from './api.js';
import { ditheredPicture } from './dither.js';

const SIZE = 56;

export function createStrip({ host, open, onResize = () => {} }) {
  const el = document.createElement('nav');
  el.className = 'strip';
  el.setAttribute('aria-label', 'Pictures of the research on the map');
  el.hidden = true;
  host.append(el);

  let shownIds = '';

  const watcher =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              watcher.unobserve(entry.target);
              fill(entry.target);
            }
          },
          { root: el, rootMargin: '0px 120px' },
        )
      : null;

  /** Fetch one picture; a piece of research without one leaves the row. */
  async function fill(button) {
    const picture = await ditheredPicture(button.dataset.url, SIZE, SIZE);
    if (!button.isConnected) return;
    if (!picture) {
      button.remove();
      if (!el.querySelector('.strip__item')) {
        el.hidden = true;
        onResize();
      }
      return;
    }
    button.querySelector('.strip__picture').append(picture);
    button.classList.add('is-ready');
  }

  /** Show these pieces of research, with `current` marked as the one open. */
  function update(sources, current = null) {
    const ids = sources.map((s) => s.id).join(' ');
    if (ids !== shownIds) {
      shownIds = ids;
      watcher?.disconnect();
      el.innerHTML = sources
        .map(
          (source) => `<button class="strip__item" type="button" data-open="${escapeHtml(source.id)}"
              data-url="${escapeHtml(source.url)}" aria-label="${escapeHtml(source.label)}" title="${escapeHtml(source.label)}">
              <span class="strip__picture"></span>
            </button>`,
        )
        .join('');
      el.scrollLeft = 0;
      el.hidden = sources.length === 0;
      for (const button of el.querySelectorAll('.strip__item')) {
        if (watcher) watcher.observe(button);
        else fill(button);
      }
    }
    for (const button of el.querySelectorAll('.strip__item')) {
      const on = button.dataset.open === current;
      button.classList.toggle('is-current', on);
      if (on) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
  }

  el.addEventListener('click', (event) => {
    const button = event.target.closest('.strip__item');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    open(button.dataset.open);
  });

  return { el, update };
}
