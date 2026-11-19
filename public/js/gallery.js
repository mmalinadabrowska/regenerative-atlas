/**
 * The gallery: pictures of the research on an island, circling its blot.
 *
 * A moment's rest, not a pass: the map is crossed constantly on the way to
 * somewhere else, and a gallery that sprang up under every blot the pointer
 * touched would be noise. After a couple of seconds on one, its research
 * comes out of the blot as a ring of dithered pictures, each named, and the
 * ring begins — slowly — to turn, the blot at its centre like a sun with its
 * planets. Pointing at a picture stops the ring so it can be read and pressed;
 * pressing it opens that piece of research, which is the next view of the map.
 * The wheel turns the ring by hand.
 *
 * Only for a pointer that can rest. A touch screen has no hover, and its
 * islands open on a tap as they always have.
 */

import { escapeHtml } from './api.js';
import { ditheredPicture } from './dither.js';

const DELAY_MS = 1600;
const LINGER_MS = 380;
const CARD = { width: 132, height: 92 };
/** A card's full height, its name above the picture included. */
const CARD_HEIGHT = CARD.height + 26;
const MOST = 12;
/** One turn of the ring, at full speed. */
const TURN_MS = 48000;
/** How long the ring takes to come out of the blot, and to get up to speed. */
const OPEN_MS = 700;
const SPIN_UP_MS = 2200;

export function createGallery({ host, canvas, map, sourcesOf, open, nameOf = (node) => node.label }) {
  const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const el = document.createElement('div');
  el.className = 'gallery';
  el.hidden = true;
  el.setAttribute('role', 'region');
  host.append(el);

  let waiting = null;
  let leaving = null;
  let current = null; // the island the gallery is showing, or about to
  let shown = false;
  let ticket = 0;
  let cards = []; // { source, el, order, slot, out }
  let centre = { x: 0, y: 0, r: 0 };
  let angle = -Math.PI / 2; // the first picture starts at the top
  let openedAt = 0;
  let last = 0;
  let held = false; // a picture is pointed at or focused: the ring waits
  let frame = null;

  function hover(node) {
    if (!canHover) return;
    clearTimeout(waiting);
    if (node?.type === 'tag') {
      if (shown && current?.id === node.id) {
        clearTimeout(leaving);
        return;
      }
      waiting = setTimeout(() => show(node), DELAY_MS);
    }
  }

  function linger() {
    clearTimeout(leaving);
    leaving = setTimeout(hide, LINGER_MS);
  }

  function hide() {
    clearTimeout(waiting);
    clearTimeout(leaving);
    cancelAnimationFrame(frame);
    ticket += 1;
    shown = false;
    current = null;
    cards = [];
    held = false;
    el.hidden = true;
    el.replaceChildren();
  }

  function show(node) {
    const at = map.screenOf(node.id);
    if (!at) return;
    hide();
    const mine = ticket;
    current = node;
    centre = at;
    angle = -Math.PI / 2;
    el.setAttribute('aria-label', `Pictures of the research filed under ${nameOf(node)}`);
    // Each picture joins the ring as it arrives, in the order the island lists
    // its research, and only once there is one: an island whose research has
    // no pictures shows nothing at all.
    sourcesOf(node)
      .slice(0, MOST)
      .forEach((source, order) => {
        ditheredPicture(source.url, CARD.width, CARD.height).then((picture) => {
          if (mine !== ticket || !picture) return;
          add(source, picture, order);
        });
      });
  }

  function add(source, picture, order) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'gallery__card';
    const label = escapeHtml(source.label);
    const note = escapeHtml([source.publisher || source.authors, source.year].filter(Boolean).join(' · '));
    card.setAttribute('aria-label', `Open ${source.label}`);
    card.innerHTML = `<span class="gallery__name">${label}</span>
      <span class="gallery__picture"></span>
      ${note ? `<span class="gallery__note">${note}</span>` : ''}`;
    card.querySelector('.gallery__picture').append(picture);
    card.addEventListener('click', () => {
      hide();
      open(source);
    });
    const hold = () => {
      held = true;
      clearTimeout(leaving);
    };
    const release = () => {
      held = false;
    };
    card.addEventListener('pointerenter', hold);
    card.addEventListener('pointerleave', release);
    card.addEventListener('focus', hold);
    card.addEventListener('blur', release);

    const entry = { source, el: card, order, slot: null, out: 0 };
    cards.push(entry);
    cards.sort((a, b) => a.order - b.order);
    el.append(card);

    if (!shown) {
      shown = true;
      el.hidden = false;
      openedAt = performance.now();
      last = openedAt;
      frame = requestAnimationFrame(turn);
    }
  }

  /**
   * The ring's size: clear of the blot, and wide enough for the cards not to
   * touch wherever they are on it — measured by a card's diagonal, which is
   * how much room it takes on the slant.
   */
  function radius() {
    const footprint = Math.hypot(CARD.width, CARD_HEIGHT) * 1.04;
    const around = (cards.length * footprint) / (2 * Math.PI);
    return Math.max(centre.r + footprint * 0.62, around, 130);
  }

  const easeOut = (t) => 1 - (1 - t) ** 3;
  const easeIn = (t) => t * t;

  function turn(now) {
    if (!shown) return;
    const dt = Math.min(now - last, 64);
    last = now;
    const age = now - openedAt;

    // Gathering speed slowly, so the ring settles into place before it moves,
    // and stopping while a picture is being looked at.
    if (!still && !held) {
      const speed = easeIn(Math.min(age / SPIN_UP_MS, 1));
      angle += ((2 * Math.PI) / TURN_MS) * speed * dt;
    }

    const r = radius();
    const n = cards.length;
    cards.forEach((card, i) => {
      // Where this picture belongs on the ring. A picture that has just
      // arrived comes out of the blot; the others make room for it by sliding
      // round rather than jumping.
      const target = (2 * Math.PI * i) / n;
      card.slot = card.slot === null ? target : card.slot + shortest(card.slot, target) * 0.12;
      card.out = still ? 1 : Math.min(card.out + dt / OPEN_MS, 1);
      const reach = r * easeOut(card.out);
      const theta = angle + card.slot;
      const x = centre.x + Math.cos(theta) * reach - CARD.width / 2;
      const y = centre.y + Math.sin(theta) * reach - CARD_HEIGHT / 2;
      card.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(0.4 + 0.6 * easeOut(card.out)).toFixed(3)})`;
      card.el.style.opacity = String(Math.min(card.out * 1.6, 1));
    });
    frame = requestAnimationFrame(turn);
  }

  /** The short way round from one angle to another. */
  const shortest = (from, to) => {
    let d = (to - from) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };

  // The gallery stays for as long as the pointer is within the ring, however
  // it crosses the open ground between the blot and the pictures, and goes a
  // moment after it leaves.
  window.addEventListener('pointermove', (event) => {
    if (!shown) return;
    const box = host.getBoundingClientRect();
    const dx = event.clientX - box.left - centre.x;
    const dy = event.clientY - box.top - centre.y;
    const reach = radius() + Math.hypot(CARD.width, CARD_HEIGHT) / 2 + 16;
    if (Math.hypot(dx, dy) <= reach) clearTimeout(leaving);
    else if (!held) linger();
  });

  // The wheel turns the ring by hand, a picture's width at a time.
  el.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      angle += Math.sign(delta) * Math.min(Math.abs(delta) / 400, 0.4);
    },
    { passive: false },
  );

  el.addEventListener('keydown', (event) => {
    const at = cards.findIndex((card) => card.el === document.activeElement);
    if (event.key === 'Escape') {
      hide();
      canvas.focus?.();
    } else if (at >= 0 && (event.key === 'ArrowRight' || event.key === 'ArrowDown')) {
      cards[(at + 1) % cards.length].el.focus();
    } else if (at >= 0 && (event.key === 'ArrowLeft' || event.key === 'ArrowUp')) {
      cards[(at - 1 + cards.length) % cards.length].el.focus();
    } else return;
    event.preventDefault();
  });

  // Anything else that moves the map takes the gallery with it.
  canvas.addEventListener('pointerdown', hide);
  canvas.addEventListener('wheel', hide, { passive: true });
  window.addEventListener('resize', hide);

  return { hover, hide };
}
