/**
 * The connected navigation.
 *
 * A row of capsules whose outlines merge into one continuous curve: where two
 * neighbours meet, the boundary pinches inward through a concave fillet rather
 * than butting together, the way two soap bubbles join.
 *
 * The geometry is exact rather than faked with a blur filter. For two end
 * circles of radius r whose centres are d apart, a fillet circle of radius R
 * tangent to both sits on the perpendicular bisector at
 *
 *     k = sqrt((r + R)² − (d / 2)²)
 *
 * from the axis, and the outline runs: along the capsule, out to the tangent
 * point, around the fillet the *other* way, back onto the next capsule. Convex
 * arcs sweep one way, concave fillets the other — that alternation is the whole
 * trick.
 *
 * Items keep their own border until the curve is drawn, so the nav is still a
 * row of buttons if this never runs.
 */

const FILLET = 1.25; // fillet radius as a multiple of the capsule radius
const SVG_NS = 'http://www.w3.org/2000/svg';

const round = (n) => Math.round(n * 100) / 100;

/** Tangent point on a circle of radius r at `centre`, facing `toward`. */
function tangent(centre, r, toward) {
  const dx = toward.x - centre.x;
  const dy = toward.y - centre.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: centre.x + (dx / length) * r, y: centre.y + (dy / length) * r };
}

/**
 * The union outline of a row of capsules sharing a centreline.
 * `caps` are the end-circle centres: { left, right } in local pixels.
 */
export function outlinePath(caps, cy, r, R) {
  if (caps.length === 0) return '';

  // Where a gap is too wide for the fillet to reach across, the two capsules
  // stay separate shapes rather than being joined by an impossible curve.
  const joints = caps.slice(0, -1).map((cap, i) => {
    const ax = cap.right;
    const bx = caps[i + 1].left;
    const d = bx - ax;
    const span = (r + R) ** 2 - (d / 2) ** 2;
    if (span <= 0 || d <= 0) return null;
    return { ax, bx, mid: (ax + bx) / 2, k: Math.sqrt(span) };
  });

  const arc = (radius, sweep, p) =>
    `A ${round(radius)} ${round(radius)} 0 0 ${sweep} ${round(p.x)} ${round(p.y)}`;
  const at = (x, y) => `${round(x)} ${round(y)}`;

  const parts = [`M ${at(caps[0].left - r, cy)}`, arc(r, 1, { x: caps[0].left, y: cy - r })];

  // Top edge, left to right.
  for (let i = 0; i < caps.length; i++) {
    parts.push(`L ${at(caps[i].right, cy - r)}`);
    const joint = joints[i];
    if (i === caps.length - 1 || !joint) {
      parts.push(arc(r, 1, { x: caps[i].right + r, y: cy }));
      if (i < caps.length - 1) {
        // A gap the fillet cannot bridge: close this shape and start the next.
        parts.push(arc(r, 1, { x: caps[i].right, y: cy + r }));
        parts.push(`L ${at(caps[i].left, cy + r)}`);
        parts.push(arc(r, 1, { x: caps[i].left - r, y: cy }));
        parts.push('Z', `M ${at(caps[i + 1].left - r, cy)}`, arc(r, 1, { x: caps[i + 1].left, y: cy - r }));
      }
      continue;
    }
    const focus = { x: joint.mid, y: cy - joint.k };
    parts.push(arc(r, 1, tangent({ x: joint.ax, y: cy }, r, focus)));
    parts.push(arc(R, 0, tangent({ x: joint.bx, y: cy }, r, focus)));
    parts.push(arc(r, 1, { x: caps[i + 1].left, y: cy - r }));
  }

  // Bottom edge, right to left.
  const last = caps.length - 1;
  parts.push(arc(r, 1, { x: caps[last].right, y: cy + r }));
  for (let i = last; i > 0; i--) {
    const joint = joints[i - 1];
    if (!joint) break;
    parts.push(`L ${at(caps[i].left, cy + r)}`);
    const focus = { x: joint.mid, y: cy + joint.k };
    parts.push(arc(r, 1, tangent({ x: joint.bx, y: cy }, r, focus)));
    parts.push(arc(R, 0, tangent({ x: joint.ax, y: cy }, r, focus)));
    parts.push(arc(r, 1, { x: caps[i - 1].right, y: cy + r }));
  }
  parts.push(`L ${at(caps[0].left, cy + r)}`, arc(r, 1, { x: caps[0].left - r, y: cy }), 'Z');

  return parts.join(' ');
}

/** One capsule on its own, used to fill the item you are hovering or on. */
export function capsulePath(cap, cy, r) {
  const p = (x, y) => `${round(x)} ${round(y)}`;
  return [
    `M ${p(cap.left, cy - r)}`,
    `L ${p(cap.right, cy - r)}`,
    `A ${round(r)} ${round(r)} 0 0 1 ${p(cap.right, cy + r)}`,
    `L ${p(cap.left, cy + r)}`,
    `A ${round(r)} ${round(r)} 0 0 1 ${p(cap.left, cy - r)}`,
    'Z',
  ].join(' ');
}

function draw(container) {
  const items = [...container.querySelectorAll('[data-connect]')];
  if (items.length === 0) return;

  const box = container.getBoundingClientRect();
  if (box.width === 0) return;

  const rects = items.map((item) => {
    const r = item.getBoundingClientRect();
    return { left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, height: r.height };
  });

  // A wrapped row has no single centreline, so there is nothing to connect.
  const cy = rects[0].top + rects[0].height / 2;
  const wrapped = rects.some((r) => Math.abs(r.top + r.height / 2 - cy) > 1);
  if (wrapped) {
    container.classList.remove('is-connected');
    container.querySelector('.connected__canvas')?.remove();
    return;
  }

  const r = rects[0].height / 2;
  const caps = rects.map((rect) => ({ left: rect.left + r, right: rect.right - r }));

  let svg = container.querySelector('.connected__canvas');
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'connected__canvas');
    svg.setAttribute('aria-hidden', 'true');
    container.prepend(svg);
  }
  svg.setAttribute('viewBox', `0 0 ${round(box.width)} ${round(box.height)}`);
  svg.setAttribute('width', round(box.width));
  svg.setAttribute('height', round(box.height));

  const fills = caps
    .map((cap, i) => `<path class="connected__fill" data-fill="${i}" d="${capsulePath(cap, cy, r)}"/>`)
    .join('');
  // Three layers to the one shape: paper underneath, so whatever the row is
  // sitting on does not run through it; the per-item fills; then the outline
  // on top, where its stroke cannot be half-covered by a filled capsule.
  const shape = outlinePath(caps, cy, r, r * FILLET);
  svg.innerHTML =
    `<path class="connected__ground" d="${shape}"/>` +
    fills +
    `<path class="connected__outline" d="${shape}"/>`;

  container.classList.add('is-connected');
  sync(container, items);
}

/** Mirror each item's state onto the shape sitting behind it. */
function sync(container, items) {
  const svg = container.querySelector('.connected__canvas');
  if (!svg) return;
  items.forEach((item, i) => {
    const on =
      item.dataset.on === 'true' ||
      item.getAttribute('aria-current') === 'page' ||
      item.matches(':hover, :focus-visible');
    svg.querySelector(`[data-fill="${i}"]`)?.toggleAttribute('data-on', on);
    item.classList.toggle('is-on', on);
  });
}

export function connect(container) {
  const items = [...container.querySelectorAll('[data-connect]')];
  const redraw = () => draw(container);

  for (const event of ['pointerenter', 'pointerleave', 'focus', 'blur']) {
    items.forEach((item) => item.addEventListener(event, () => sync(container, items), true));
  }
  new ResizeObserver(redraw).observe(container);
  redraw();
  document.fonts?.ready.then(redraw);
  return redraw;
}

for (const container of document.querySelectorAll('[data-connected-nav]')) connect(container);
