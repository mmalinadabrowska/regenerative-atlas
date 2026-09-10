/**
 * The Atlas' drawing hand.
 *
 * Every mark on the site — the icons on the landing page and every node on the
 * map — comes from here, so the whole thing looks drawn by one person. The
 * shapes are Miró by way of a brush pen: closed blobs with uneven weight,
 * asterisk stars, lone crescents. Nothing is random at runtime; each glyph is
 * derived from a seed, so a source keeps the same body every time you visit.
 */

/** Deterministic 32-bit hash of a string — a node's id becomes its seed. */
export function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An irregular closed blob: a ring of points at wandering radii, joined with
 * a Catmull-Rom-ish smooth. Returned in unit space (roughly -1..1) so callers
 * can scale it to whatever the node's weight deserves.
 */
export function blobPoints(seed, { lobes = 7, wobble = 0.42 } = {}) {
  const random = rng(seed);
  const count = lobes + Math.floor(random() * 3);
  const points = [];
  const drift = random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const angle = drift + (i / count) * Math.PI * 2;
    const radius = 1 - wobble / 2 + random() * wobble;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius * (0.78 + random() * 0.4)]);
  }
  return points;
}

/** Draw a closed smooth curve through points, scaled and centred at (cx, cy). */
export function traceBlob(ctx, points, cx, cy, scale) {
  const n = points.length;
  const at = (i) => {
    const [x, y] = points[((i % n) + n) % n];
    return [cx + x * scale, cy + y * scale];
  };
  ctx.beginPath();
  const [sx, sy] = at(0);
  ctx.moveTo((sx + at(1)[0]) / 2, (sy + at(1)[1]) / 2);
  for (let i = 1; i <= n; i++) {
    const [cxp, cyp] = at(i);
    const [nx, ny] = at(i + 1);
    ctx.quadraticCurveTo(cxp, cyp, (cxp + nx) / 2, (cyp + ny) / 2);
  }
  ctx.closePath();
}

/** The same blob as an SVG path string, for static marks in the page. */
export function blobPath(seed, scale = 10, options) {
  const points = blobPoints(seed, options);
  const n = points.length;
  const at = (i) => {
    const [x, y] = points[((i % n) + n) % n];
    return [x * scale, y * scale];
  };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const round = (v) => Math.round(v * 100) / 100;

  let d = '';
  const start = mid(at(0), at(1));
  d += `M ${round(start[0])} ${round(start[1])}`;
  for (let i = 1; i <= n; i++) {
    const control = at(i);
    const end = mid(control, at(i + 1));
    d += ` Q ${round(control[0])} ${round(control[1])} ${round(end[0])} ${round(end[1])}`;
  }
  return `${d} Z`;
}

/**
 * A star: an asterisk of uneven arms, the mark Miró scatters between the
 * heavier bodies. Used for tag nodes, which are ideas rather than things.
 */
export function star(ctx, cx, cy, radius, seed) {
  const random = rng(seed);
  const arms = 4 + Math.floor(random() * 3);
  const drift = random() * Math.PI;
  ctx.beginPath();
  for (let i = 0; i < arms; i++) {
    const angle = drift + (i / arms) * Math.PI * 2;
    const length = radius * (0.62 + random() * 0.75);
    ctx.moveTo(cx - Math.cos(angle) * length * 0.18, cy - Math.sin(angle) * length * 0.18);
    ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
  }
}

/**
 * A line with a little life in it. Straight lines read as diagram; a line that
 * bows very slightly reads as drawn. The bow is derived from the endpoints so
 * it never shimmers between frames.
 */
export function inkLine(ctx, x1, y1, x2, y2, amount = 0.06) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const lean = ((Math.round(x1 + y2) % 7) - 3) / 3;
  const bow = length * amount * lean;
  const mx = (x1 + x2) / 2 - (dy / length) * bow;
  const my = (y1 + y2) / 2 + (dx / length) * bow;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
}
