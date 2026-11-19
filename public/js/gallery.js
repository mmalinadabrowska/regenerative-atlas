/**
 * The gallery: pictures of the research on an island, circling its blot.
 *
 * A moment's rest, not a pass: the map is crossed constantly on the way to
 * somewhere else, and a gallery that sprang up under every blot the pointer
 * touched would be noise. After a couple of seconds on one, its research
 * comes up above it as a stack of dithered pictures, each named — the front
 * one whole, the rest fanned out behind it. A couple of seconds later the
 * pictures slide out from under one another, one after the next, and close
 * round the blot in a tight ring, overlapping like a hand of cards; and the
 * ring begins — slowly — to turn, the blot at its centre like a sun with its
 * planets, each picture drifting a little on its own as it goes.
 *
 * Once out, it carries on by itself: moving the pointer away does not put it
 * back. It stops turning when you ask it to — a tap on the blot at its centre
 * (the next tap opens the island, as it always has), or pointing at one of
 * the pictures, which holds it still to be read. Pressing a picture opens that
 * piece of research, which is the next view of the map. Tapping anywhere else
 * on the map, moving the map, or Escape puts the gallery away; resting on
 * another blot brings up that one's instead.
 *
 * Only for a pointer that can rest. A touch screen has no hover, and its
 * islands open on a tap as they always have.
 */

import { escapeHtml } from './api.js';
import { ditheredPicture } from './dither.js';

const DELAY_MS = 1600;
const CARD = { width: 132, height: 92 };
/** A card's full height, its name above the picture included. */
const CARD_HEIGHT = CARD.height + 26;
const MOST = 12;
/** One turn of the ring, at full speed. */
const TURN_MS = 48000;
/** How long the ring takes to come out of the blot, and to get up to speed. */
const OPEN_MS = 700;
const SPIN_UP_MS = 2200;
/** How long the stack stands before the pictures slide out of it into the ring. */
const STACK_MS = 2000;
/** Each picture's slide from the stack to the ring, and the beat between them. */
const SLIDE_MS = 950;
const STAGGER_MS = 110;
/** How far each card behind the front one stands out of the stack, as a share of a card. */
const FAN = [0, 0.52, 0.72, 0.92];

export function createGallery({ host, canvas, map, sourcesOf, open, nameOf = (node) => node.label }) {
  const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const el = document.createElement('div');
  el.className = 'gallery';
  el.hidden = true;
  el.setAttribute('role', 'region');
  host.append(el);

  let waiting = null;
  let current = null; // the island the gallery is showing, or about to
  let shown = false;
  let ticket = 0;
  let cards = []; // { source, el, order, slot, out, phase }
  let centre = { x: 0, y: 0, r: 0 };
  let angle = -Math.PI / 2; // the first picture starts at the top
  let openedAt = 0;
  let last = 0;
  let pointedAt = null; // the card under the pointer, or focused: held still
  let gathered = 0; // how long the gallery has run, not counting while held or stopped
  let stopped = false; // the blot was tapped: the ring has stopped turning
  let spin = 0; // how fast it is turning now, from 0 to 1 of full speed
  let frame = null;

  function hover(node) {
    if (!canHover) return;
    clearTimeout(waiting);
    // Resting on a blot brings up its pictures; resting on the one already
    // circled changes nothing.
    if (node?.type === 'tag' && !(shown && current?.id === node.id)) {
      waiting = setTimeout(() => show(node), DELAY_MS);
    }
  }

  /**
   * A tap on the map, asked about before the map acts on it. On the blot the
   * pictures are circling, the first tap stops them and is kept; anywhere
   * else, the gallery is put away and the map does what it would have done.
   */
  function press(node) {
    clearTimeout(waiting);
    if (!shown) return false;
    if (node && node.id === current?.id && !stopped) {
      stopped = true;
      return true;
    }
    hide();
    return false;
  }

  function hide() {
    clearTimeout(waiting);
    cancelAnimationFrame(frame);
    ticket += 1;
    shown = false;
    current = null;
    cards = [];
    pointedAt = null;
    stopped = false;
    spin = 0;
    gathered = 0;
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
      pointedAt = entry;
    };
    const release = () => {
      if (pointedAt === entry) pointedAt = null;
    };
    card.addEventListener('pointerenter', hold);
    card.addEventListener('pointerleave', release);
    card.addEventListener('focus', hold);
    card.addEventListener('blur', release);

    // A picture that arrives once the stack has begun to come apart goes
    // straight into the ring, out of the blot, rather than into a stack that
    // is no longer there.
    const late = gathered > STACK_MS;
    const entry = { source, el: card, order, late, slot: null, out: 0, phase: Math.random() * Math.PI * 2, bob: 0, tilt: 0 };
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
   * The ring's size: tight. The cards overlap round it the way they did in the
   * stack, each tucked a little under the next, so a dozen pictures make a
   * ring hardly wider than the stack was — but never so tight that the blot
   * they circle is covered.
   */
  function radius() {
    const around = (cards.length * CARD.width * 0.6) / (2 * Math.PI);
    return Math.max(centre.r + CARD.width * 0.62, around);
  }

  /** Where the stack stands: over the blot, or under it when there is no room above. */
  function stackOrigin() {
    const height = CARD_HEIGHT;
    let top = centre.y - centre.r - height - 14;
    if (top < 12) top = centre.y + centre.r + 14;
    return { left: centre.x - CARD.width / 2, top };
  }

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  const easeOut = (t) => 1 - (1 - t) ** 3;
  const easeIn = (t) => t * t;

  function turn(now) {
    if (!shown) return;
    const dt = Math.min(now - last, 64);
    last = now;

    // The gallery's own clock: it stands still while a picture is being looked
    // at or the gallery has been stopped, so nothing moves on without you.
    if (!pointedAt && !stopped) gathered += dt;

    // The ring follows its blot as the map breathes, so the two stay one thing.
    const at = map.screenOf(current.id);
    if (at) centre = at;

    const n = cards.length;
    const stacked = cards.filter((card) => !card.late).length;
    // The ring turns once every picture has slid into it, gathering speed
    // slowly; coming to rest, rather than halting, when it is asked to stop —
    // and picking up again when a picture it was held for is let go.
    const settled = STACK_MS + Math.max(stacked - 1, 0) * STAGGER_MS + SLIDE_MS;
    const ringing = still ? false : gathered > settled;
    const wanted = !ringing || stopped || pointedAt ? 0 : easeIn(Math.min((gathered - settled) / SPIN_UP_MS, 1));
    spin += (wanted - spin) * Math.min(dt / 260, 1);
    angle += ((2 * Math.PI) / TURN_MS) * spin * dt;

    const r = radius();
    const origin = stackOrigin();
    cards.forEach((card, i) => {
      card.out = Math.min(card.out + dt / (card.late ? OPEN_MS : 240), 1);

      // How far this picture is from the stack to the ring, 0 to 1: one after
      // another, from the front, each sliding out from under the one before.
      const slide = still
        ? 0
        : card.late
          ? 1
          : easeInOut(Math.min(Math.max((gathered - STACK_MS - i * STAGGER_MS) / SLIDE_MS, 0), 1));

      // In the stack: the front one whole, the next three fanned out behind,
      // the rest hidden under them until the stack comes apart.
      const fan = FAN[Math.min(i, FAN.length - 1)];
      const sx = origin.left + fan * CARD.width;
      const sy = origin.top + (1 - card.out) * 8;
      const stackShown = i < FAN.length ? 1 : 0;

      // In the ring: its place round the blot, the first at the top — where
      // the stack was — so the front picture barely moves and the rest come
      // round to meet it. A picture that has just arrived makes its way out of
      // the blot; the others make room for it by sliding round, not jumping.
      const target = (2 * Math.PI * i) / n;
      card.slot = card.slot === null ? target : card.slot + shortest(card.slot, target) * 0.12;
      if (!still && card !== pointedAt) {
        card.bob = Math.sin(now * 0.0011 + card.phase) * 5;
        card.tilt = Math.sin(now * 0.0007 + card.phase * 1.7) * 1.8;
      }
      const reach = card.late ? r * easeOut(card.out) : r;
      const theta = angle + card.slot;
      const rx = centre.x + Math.cos(theta) * (reach + card.bob) - CARD.width / 2;
      const ry = centre.y + Math.sin(theta) * (reach + card.bob) - CARD_HEIGHT / 2;

      const x = sx + (rx - sx) * slide;
      const y = sy + (ry - sy) * slide;
      const grow = card === pointedAt ? 1.06 : card.late ? 0.4 + 0.6 * easeOut(card.out) : 1;
      card.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(card.tilt * slide).toFixed(2)}deg) scale(${grow.toFixed(3)})`;
      card.el.style.opacity = String(Math.min(card.out * 1.6, 1) * Math.max(stackShown, slide));
      // Stacked, the front card is on top; in the ring, the cards lower down
      // overlap the ones above them, as a ring of cards laid on a table does.
      // The one being looked at comes to the top of either.
      card.el.style.zIndex =
        card === pointedAt ? '300' : slide < 0.5 ? String(100 - i) : String(150 + Math.round(Math.sin(theta) * 40));
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

  // Moving the map takes the gallery with it: a drag (a tap is answered in
  // press, above), a zoom, a change of window.
  let pressedAt = null;
  canvas.addEventListener('pointerdown', (event) => {
    pressedAt = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener('pointermove', (event) => {
    if (!pressedAt || !event.buttons) return;
    if (Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > 6) {
      pressedAt = null;
      if (shown) hide();
    }
  });
  window.addEventListener('pointerup', () => {
    pressedAt = null;
  });
  canvas.addEventListener('wheel', () => shown && hide(), { passive: true });
  window.addEventListener('resize', () => shown && hide());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && shown) hide();
  });

  return { hover, press, hide };
}
