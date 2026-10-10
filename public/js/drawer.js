/**
 * What the map's pages share: the drawer research comes up in — a card beside
 * the map on a wide screen, a sheet that rises from the bottom on a phone —
 * and the means of taking what is in it away, as a file or on paper.
 *
 * Explore and the librarian both read the library in this drawer, so it is
 * the same drawer: the same grip, the same drag, the same scroll rail, and the
 * same picture of the map on the printed page.
 */

import { blobPath, seedOf } from './ink.js';
import { MM, widthOf as textWidth } from './pdf.js';

/** The mark a piece of research wears everywhere: on the map, and in a list. */
export const CROSSHAIR = `<svg class="crosshair" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="9"/><path d="M12 4.6 V19.4 M4.6 12 H19.4"/></svg>`;

/** A tag's own blot, drawn at label size from the same seed the map uses. */
export const blotMark = (id) =>
  `<svg class="blot" viewBox="-13 -13 26 26" aria-hidden="true" focusable="false">
    <path d="${blobPath(seedOf(id), 11, { lobes: 8, wobble: 0.85 })}"/></svg>`;

/** Today, as a printed record dates itself. */
export const WHEN = () =>
  new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/* --- the map, on paper ---------------------------------------------------- */

/* The frame the map is printed in: the same size on every record, whatever is
   in it. A picture that grew with its contents would give a sheaf of printed
   records a different shape on every page, and a record is a document rather
   than a poster. Taken from the design: 80mm by 62mm, at the left margin. */
export const FRAME = { width: 80 * MM, height: 62 * MM, pad: 5 * MM };

/** The whole measure of an A4 page, for a page that is mostly its picture. */
export const WIDE_FRAME = { width: 180 * MM, height: 105 * MM, pad: 6 * MM };

/** A blot's smooth outline, resampled as points a PDF can draw straight to. */
function blobOutline(points, cx, cy, scale, steps = 5) {
  const n = points.length;
  const at = (i) => points[((i % n) + n) % n];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = mid(at(i), at(i + 1));
    const control = at(i + 1);
    const end = mid(at(i + 1), at(i + 2));
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      const u = 1 - t;
      const x = u * u * start[0] + 2 * u * t * control[0] + t * t * end[0];
      const y = u * u * start[1] + 2 * u * t * control[1] + t * t * end[1];
      out.push([cx + x * scale, cy + y * scale]);
    }
  }
  return out;
}

/**
 * The map, as it stands, drawn into the record.
 *
 * Black on white and nothing else: the washes tell one theme from another on a
 * screen, and on a page they would be twelve greys saying nothing. What is left
 * is the drawing — where the marks sit, what is tied to what, how big a theme
 * is — which is what the picture was for.
 *
 * The frame is fixed and the map is fitted to it, never the other way round.
 *
 * `trace` is the constellation's own account of what it is showing. With
 * nothing opened in it — a whole constellation rather than one thing and its
 * ties — the themes are named and the research is left as marks. `frame`
 * lets a page that is about the picture give it more of the sheet, `names`
 * sets its names larger to match, and `dotted` draws its ties as dots, the way
 * the librarian's constellation is drawn on screen.
 */
export function printGraph(sheet, trace, { frame: size = FRAME, dotted = false, names = 1 } = {}) {
  if (!trace || trace.nodes.length === 0) return;
  const FRAME = size;

  const marks = trace.nodes;

  // Named: what you opened, and what is tied straight to it. Everything else in
  // the frame is the company it keeps — thirty-three names in a box this size
  // is a thicket, and the drawing is what the page is for. The same choice the
  // map makes when it puts a name under a mark you are looking at.
  const tied = new Set(
    trace.links
      .filter((link) => link.a === trace.focused || link.b === trace.focused)
      .map((link) => (link.a === trace.focused ? link.b : link.a)),
  );
  const named = tied.size <= 12;
  const namesFor = trace.focused
    ? new Set(named ? [trace.focused, ...tied] : [trace.focused])
    : new Set(marks.filter((node) => node.type === 'tag').map((node) => node.id));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of marks) {
    minX = Math.min(minX, node.x - node.r);
    minY = Math.min(minY, node.y - node.r);
    maxX = Math.max(maxX, node.x + node.r);
    // Room under a mark for the name that hangs off it.
    maxY = Math.max(maxY, node.y + node.r + (namesFor.has(node.id) ? 9 : 0));
  }

  sheet.draw(FRAME.height, (pen, box) => {
    // The frame is a measure, not a line: it fixes where the drawing sits and
    // how much room it has — the same on every record — and then gets out of
    // the way. Drawn, it boxed the map in on a page that has no other box on it.
    pen.box = { ...box, w: FRAME.width };

    const room = { w: FRAME.width - FRAME.pad * 2, h: FRAME.height - FRAME.pad * 2 };
    const scale = Math.min(room.w / Math.max(maxX - minX, 1), room.h / Math.max(maxY - minY, 1));
    const ox = box.x + FRAME.pad + (room.w - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = box.y + FRAME.pad + (room.h - (maxY - minY) * scale) / 2 - minY * scale;
    const at = (node) => [ox + node.x * scale, oy + node.y * scale];

    // Lines first, so the marks sit on them rather than under them.
    for (const link of trace.links) {
      pen.line(ox + link.ax * scale, oy + link.ay * scale, ox + link.bx * scale, oy + link.by * scale, {
        grey: dotted ? 0.45 : 0.72,
        width: dotted ? 0.9 : 0.25,
        dots: dotted ? 2.4 : 0,
      });
    }

    // Names are placed after the marks and only where they will be read: a
    // name that lands on another name is two names lost, and the drawing is
    // worth more than the caption. Nearest the middle goes down first, since
    // that is what the picture is about; the rest take what room is left.
    const wanted = [];

    for (const node of marks) {
      const [x, y] = at(node);
      // A floor in points, not in world units: a crosshair below about two
      // points is a full stop, and the mark is the whole of what tells a piece
      // of research from a theme on the page.
      const r = Math.max(node.r * scale, node.type === 'tag' ? 2 : 2.3);
      if (node.type === 'tag') {
        const outline = node.blob
          ? blobOutline(node.blob, x, y, r)
          : null;
        // Filled paper-white so a line running under a blot stops at its edge;
        // the one you opened is filled grey, which is the only weight the page
        // gives to what the screen gives a colour.
        const paint = { grey: 0, width: node.open ? 0.8 : 0.55, fill: node.open ? 0.82 : 1 };
        if (outline) pen.shape(outline, paint);
        else pen.ring(x, y, r, paint);
      } else {
        pen.crosshair(x, y, r, { grey: 0, width: 0.45 });
      }
      if (node.label && namesFor.has(node.id)) {
        const size = (node.open ? 5.6 : 4.6) * names;
        wanted.push({ node, x, y: y + r * (names > 1 ? 1.45 : 1) + 4.6 * names, size });
      }
    }

    const middle = { x: box.x + FRAME.width / 2, y: box.y + FRAME.height / 2 };
    wanted.sort(
      (a, c) =>
        Number(c.node.open) - Number(a.node.open) ||
        Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(c.x - middle.x, c.y - middle.y),
    );

    const placed = [];
    for (const name of wanted) {
      const w = textWidth(name.node.label, 'sans', name.size);
      const rect = {
        left: name.x - w / 2,
        right: name.x + w / 2,
        top: name.y - name.size,
        bottom: name.y + name.size * 0.3,
      };
      const outside =
        rect.left < box.x + 1 ||
        rect.right > box.x + FRAME.width - 1 ||
        rect.bottom > box.y + FRAME.height - 1;
      const clashes = placed.some(
        (had) =>
          rect.left < had.right + 1 &&
          rect.right > had.left - 1 &&
          rect.top < had.bottom + 1 &&
          rect.bottom > had.top - 1,
      );
      if (outside || clashes) continue;
      placed.push(rect);
      pen.label(name.node.label, name.x, name.y, {
        size: name.size,
        grey: name.node.open ? 0 : 0.3,
      });
    }
  });
  sheet.space(9);
}

/* --- handing over a file -------------------------------------------------- */

/**
 * Hand a file to whoever is reading.
 *
 * A page is not always allowed to do this by itself — inside a sandbox an
 * ordinary download link does nothing at all — so a host that has its own way
 * of doing it leaves that way here, and it is used in preference.
 */
export function hand(name, data) {
  if (typeof window.__ATLAS_SAVE__ === 'function') {
    window.__ATLAS_SAVE__(name, data);
    return;
  }

  const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked late: some browsers are still reading the blob as the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* --- the drawer ----------------------------------------------------------- */

/**
 * The drawer's behaviour, attached to its markup: the card's scroll rail, and
 * on a phone the sheet — preview and open, dragged or tapped, put away with a
 * shove. `map` is the constellation it sits over, which is refitted as the
 * sheet settles and let go of when the drawer closes.
 */
export function createDrawer({ panel, head, body, grip, rail, railDot, map, onClose = () => {} }) {
  /* The card's own scrollbar: a hairline down the edge of the record with a dot at
     your place in it. It is hidden the moment there is nothing to scroll. */


  function trackScroll() {
    const room = body.scrollHeight - body.clientHeight;
    const live = room > 2;
    rail.classList.toggle('is-live', live);
    if (!live) return;
    const travel = Math.max(rail.clientHeight - railDot.offsetHeight, 0);
    railDot.style.transform = `translateY(${Math.round((body.scrollTop / room) * travel)}px)`;
  }

  body.addEventListener('scroll', trackScroll, { passive: true });
  window.addEventListener('resize', trackScroll);
  if (window.ResizeObserver) new ResizeObserver(trackScroll).observe(body);

  // The sheet layout is the one that gives the grip a box, so asking the grip is
  // the same question the stylesheet answers and the two cannot drift apart.
  const isSheet = () => getComputedStyle(grip).display !== 'none';

  function cssLength(value) {
    const length = parseFloat(value);
    if (!Number.isFinite(length)) return 0;
    return value.trim().endsWith('rem')
      ? length * parseFloat(getComputedStyle(document.documentElement).fontSize)
      : length;
  }

  // How much of the sheet stands above the fold while it is only peeking, and how
  // far it has left to climb before it is all the way up.
  const peekHeight = () => cssLength(getComputedStyle(panel).getPropertyValue('--sheet-peek'));
  const travel = () => Math.max(panel.offsetHeight - peekHeight(), 0);

  function setSheet(next) {
    panel.dataset.sheet = next;
    grip.setAttribute('aria-expanded', String(next === 'open'));
    // The preview hides most of the record, so how much there is to scroll
    // changes with the state — and it changes without the sheet's box changing,
    // which is the one thing the observer below would have noticed.
    trackScroll();
  }

  function open() {
    // A record arrives as a preview — its title bar and the line under it — and
    // the map keeps the screen until you ask for the rest. But an open drawer
    // stays open: opening something else from the map while you are reading is a
    // change of subject, not a reason to put the drawer away and start again.
    panel.style.transform = '';
    panel.style.height = '';
    const carryOn = panel.classList.contains('is-open') && panel.dataset.sheet === 'open';
    setSheet(carryOn ? 'open' : 'peek');
    measurePeek();
    panel.classList.add('is-open');
    body.scrollTop = 0;
    trackScroll();
  }

  /**
   * How much sheet the preview needs, measured rather than guessed: a tag has no
   * citation line under its name and a piece of research does, and one fixed
   * height would leave one of them showing a band of empty paper.
   */
  function measurePeek() {
    const meta = body.querySelector('.panel__meta');
    // Measured to the bottom edge of the last thing in the preview: the title bar
    // for a tag, the citation line for a piece of research. Anything beyond that
    // is a band of empty paper under the colour.
    const top = panel.getBoundingClientRect().top;
    const last = (meta ?? head).getBoundingClientRect().bottom;
    const peek = last - top + (meta ? 14 : 0);
    if (peek <= 0) return;
    panel.style.setProperty('--sheet-peek', `${Math.round(peek)}px`);
    // The floating zoom cluster rides above the drawer, and it is a cousin of the
    // sheet rather than a child of it, so the measurement is published on the
    // shell where both can read it.
    panel.parentElement.style.setProperty('--sheet-peek', `${Math.round(peek)}px`);
  }

  function close() {
    panel.style.transform = '';
    panel.classList.remove('is-open');
    setSheet('peek');
    map.highlight(null);
    onClose();
  }

  // Whenever the sheet settles, the map reframes into whatever is left of it —
  // down for the room it gets back, up so that what you opened stays on screen in
  // the band above the drawer rather than disappearing behind it.
  panel.addEventListener('transitionend', (event) => {
    if (event.propertyName !== 'transform' || event.target !== panel) return;
    if (isSheet() && panel.classList.contains('is-open')) map.fit();
  });

  /* Drag — from the grip at any time, from anywhere on the sheet while it peeks,
     since nothing is scrolling under your thumb then. */

  let drag = null;
  let suppressClick = false;

  function draggableFrom(event) {
    if (!isSheet() || !panel.classList.contains('is-open')) return false;
    if (event.pointerType === 'mouse' && event.button !== 0) return false;
    if (event.target.closest('.panel__close')) return false;
    return Boolean(event.target.closest('.sheet-grip')) || panel.dataset.sheet === 'peek';
  }

  panel.addEventListener('pointerdown', (event) => {
    if (!draggableFrom(event)) return;
    const distance = travel();
    const from = panel.dataset.sheet === 'open' ? 0 : distance;
    drag = {
      id: event.pointerId,
      y: event.clientY,
      lastY: event.clientY,
      lastAt: event.timeStamp,
      moved: 0,
      // The same allowance the map gives a tap: a thumb rolls as it lifts, and a
      // sheet that starts sliding at four pixels turns half the taps on it into
      // little drags that go nowhere.
      slop: event.pointerType === 'mouse' ? 4 : 10,
      base: from,
      offset: from,
      travel: distance,
      height: panel.offsetHeight,
      captured: false,
    };
    // The finger leaves the sheet within the first few pixels of dragging it up,
    // so the rest of the gesture is followed from the window rather than from the
    // element it started on.
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  });

  function onMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dy));
    if (drag.moved < drag.slop) return;
    if (!drag.captured) {
      // Captured only once this is really a drag. Capture keeps the map from
      // taking the rest of the gesture — and it retargets the click that follows
      // to the sheet, which a tap on a link inside the sheet could not survive.
      panel.setPointerCapture(event.pointerId);
      drag.captured = true;
    }
    panel.classList.add('is-dragging');
    // Below the peek line the sheet keeps going, because a shove downwards is how
    // you put a record away.
    const raw = drag.base + dy;
    drag.offset = Math.min(raw, drag.travel + peekHeight());
    drag.lastY = event.clientY;
    drag.lastAt = event.timeStamp;

    if (drag.offset < 0) {
      // Pulled above its open position the sheet grows upwards instead of
      // travelling: anchored to the bottom of the screen, it can stretch without
      // opening a gap under itself. The give is resisted and runs out, so it
      // reads as the top of the record rather than as somewhere left to go.
      panel.style.transform = 'translateY(0px)';
      panel.style.height = `${Math.round(drag.height + rubber(-drag.offset))}px`;
      return;
    }
    panel.style.height = '';
    panel.style.transform = `translateY(${drag.offset}px)`;
  }

  /** Resisted give: distance short of `limit`, approaching it and never past. */
  const rubber = (distance, limit = 72) => (distance * limit) / (distance + limit);

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const gesture = drag;
    drag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    panel.classList.remove('is-dragging');
    panel.style.transform = '';
    panel.style.height = '';
    if (gesture.moved < 4) return; // a tap: the click handler below has it

    // A drag that ends over the sheet would otherwise land as a click on whatever
    // is under the finger. Only the click of this gesture is swallowed — a drag
    // that ends without one must not eat the next tap.
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const elapsed = Math.max(event.timeStamp - gesture.lastAt, 1);
    const velocity = (event.clientY - gesture.lastY) / elapsed; // px/ms, downwards positive
    const peek = peekHeight();

    if (gesture.offset > gesture.travel + peek * 0.4 || (velocity > 0.5 && gesture.offset >= gesture.travel)) {
      close();
      map.reset();
      return;
    }
    // A flick decides on its own; a slow drag is decided by where it was let go.
    if (velocity < -0.35) setSheet('open');
    else if (velocity > 0.35) setSheet('peek');
    else setSheet(gesture.offset < gesture.travel * 0.5 ? 'open' : 'peek');
  }

  /* Tap — the grip toggles, and a peeking sheet opens wherever you touch it. The
     same two moves as the drag, for anyone who would rather not drag. */

  panel.addEventListener('click', (event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!isSheet() || event.target.closest('.panel__close')) return;
    if (event.target.closest('.sheet-grip')) {
      setSheet(panel.dataset.sheet === 'open' ? 'peek' : 'open');
      return;
    }
    if (panel.dataset.sheet !== 'open' && !event.target.closest('a, button')) setSheet('open');
  });

  // The sheet is a phone arrangement; crossing back to the desktop one leaves it
  // with a half-dragged transform and an expanded state that mean nothing there.
  let settling;
  window.addEventListener('resize', () => {
    // Nothing animates while the window is being dragged. The card is parked off
    // the right in one layout and under the bottom in the other, so a resize
    // across the breakpoint would otherwise play that journey — a closed drawer
    // sliding over the map, animating a thing that is not even open.
    panel.classList.add('is-resizing');
    clearTimeout(settling);
    settling = setTimeout(() => panel.classList.remove('is-resizing'), 160);

    if (!isSheet()) {
      panel.style.transform = '';
      setSheet('peek');
    }
  });

  return { open, close, setSheet, isSheet, trackScroll };
}
