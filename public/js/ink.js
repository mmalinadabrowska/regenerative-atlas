/**
 * The Atlas' drawing hand.
 *
 * Every mark on the site — the icons on the landing page and every node on the
 * map — comes from here, so the whole thing looks drawn by one person. The
 * shapes are Miró by way of a brush pen: closed blobs with uneven weight,
 * lone crescents, small plotted marks. Nothing is random at runtime; each glyph is
 * derived from a seed, so a source keeps the same body every time you visit.
 */

/**
 * The washes.
 *
 * A survey sheet is drawn in ink and coloured in washes, and the washes are a
 * short family rather than a wheel: the greens and olives of
 * ground cover, blues from slate to indigo, the pinks between rose and plum,
 * the ochres a survey sheet washes high ground with, and bone. No orange: an
 * earth yellow that has gone that far round stops being a wash and starts being
 * a warning. They are mixed for cream paper with ink over them, so none of them
 * is bright — but they are not all one weight either. A family pitched at a
 * single lightness is a family you cannot tell apart at blot size, so this one
 * runs from bone at 84 down to deep green at 38, and neighbours in the walk
 * differ in weight as well as in hue: the fastest way to tell two shapes apart
 * across a map is that one is pale and the other is not.
 *
 * Every shape carries one: the drawing is the ink, and the colour is laid
 * inside it.
 */
export const INK = '#100f0d';
export const PAPER = '#f2ecdf';

const WASHES = [
  [205, 26, 70], // slate blue
  [350, 40, 74], // dusty rose
  [128, 22, 38], // deep green
  [45, 38, 55], //  ochre
  [212, 30, 48], // steel blue
  [330, 26, 62], // mallow
  [95, 22, 66], //  sage
  [36, 30, 40], //  raw umber
  [180, 24, 56], // teal
  [6, 34, 60], //   brick rose
  [112, 20, 50], // moss
  [50, 30, 74], //  straw
  [225, 18, 62], // indigo grey
  [318, 20, 48], // plum
  [70, 30, 48], //  olive
  [40, 26, 78], //  pale ochre
  [155, 20, 62], // sea green
  [60, 12, 84], //  bone
];

/**
 * The wash for the index-th shape.
 *
 * The family is laid out in the order it is walked — a blue, a rose, a green,
 * an ochre, and round again — so consecutive shapes are never in the same
 * register, let alone the same colour. Eighteen washes and forty-odd tags means
 * it comes round; that is true of a survey sheet as well, where there are
 * always more formations than there are washes, and two of the same colour a
 * map apart read as two formations rather than as one.
 */
export const WASH_COUNT = WASHES.length;

export function washFor(index) {
  const [hue, sat, light] = WASHES[((index % WASHES.length) + WASHES.length) % WASHES.length];
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/** Relative luminance, the way contrast is actually reckoned. */
function luminance(hue, sat, light) {
  const s = sat / 100;
  const l = light / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((((hue % 360) + 360) % 360) / 60 % 2 - 1));
  const m = l - c / 2;
  const sixth = Math.floor((((hue % 360) + 360) % 360) / 60);
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sixth].map((v) => v + m);
  const linear = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

const PAPER_LUMINANCE = 0.8;
const INK_LUMINANCE = 0.006;
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Whether a wash wants paper-coloured type on it, decided by which of the two
 * reads better rather than by a guess at where dark begins. A mid olive looks
 * dark and is not: paper on it is worse than ink by half again. Everything that
 * sets a wash gets it from `washFor` or is ink, so the one format they come in
 * is the only one parsed — and anything else is treated as ink, which is the
 * safe way round.
 */
export function needsPaper(wash) {
  const parts = /^hsl\(\s*([-\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(String(wash ?? ''));
  if (!parts) return true;
  const ground = luminance(Number(parts[1]), Number(parts[2]), Number(parts[3]));
  return contrast(PAPER_LUMINANCE, ground) > contrast(INK_LUMINANCE, ground);
}

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
 * A cross in a circle: the mark for one piece of research.
 *
 * Deliberately plain and near-uniform in size. Research is the thing being
 * indexed, not the thing organising the map, so it reads as a plotted point
 * against the drawn ink of the tags. The caller strokes it.
 */
export function crossInCircle(ctx, cx, cy, radius) {
  // The arms stop short of the ring, or at small sizes the cross closes the
  // circle up and the whole mark reads as a dot.
  const arm = radius * 0.82;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
}

/* --------------------------------------------------------------------------
   Brush strokes
   -------------------------------------------------------------------------- */

/** Catmull-Rom through four control points — a curve that passes through them. */
function spline(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const axis = (i) =>
    0.5 *
    (2 * p1[i] +
      (-p0[i] + p2[i]) * t +
      (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
      (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  return [axis(0), axis(1)];
}

/** Resample a centreline into a dense polyline, carrying a width along it. */
function sampleCentreline(points, widths, closed, density) {
  const n = points.length;
  const at = (i) => points[closed ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1)];
  const widthAt = (i) => widths[closed ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1)];

  const out = [];
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    for (let step = 0; step < density; step++) {
      const t = step / density;
      const [x, y] = spline(at(i - 1), at(i), at(i + 1), at(i + 2), t);
      out.push({ x, y, w: widthAt(i) + (widthAt(i + 1) - widthAt(i)) * t });
    }
  }
  if (!closed) {
    const last = points[n - 1];
    out.push({ x: last[0], y: last[1], w: widths[n - 1] });
  }
  return out;
}

const round = (v) => Math.round(v * 10) / 10;

function polyline(points) {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`).join(' ');
}

/**
 * A brush stroke: a centreline whose width varies along its length, returned as
 * a filled outline rather than a stroked line.
 *
 * This is what separates a drawn mark from a plotted one. A pen has a nib and
 * the nib turns: the line swells where the hand pressed and thins where it
 * lifted. `widths` gives the nib width at each control point — taper the ends
 * and a stroke reads as brushed; keep them equal and it reads as a ribbon.
 *
 * A closed centreline returns a hollow ring (two contours, even-odd filled),
 * which is how the blob-shaped marks in the Atlas are made.
 */
export function brushStroke(points, options = {}) {
  const { width = 8, widths, closed = false, density = 10 } = options;
  if (points.length < 2) return '';

  const profile = Array.isArray(widths)
    ? widths
    : points.map((_, i) => {
        if (closed || points.length < 3) return width;
        // Taper both ends so the mark starts and finishes like a brush.
        const t = i / (points.length - 1);
        return width * (0.42 + 0.58 * Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)) ** 0.55);
      });

  const spine = sampleCentreline(points, profile, closed, density);
  const left = [];
  const right = [];

  for (let i = 0; i < spine.length; i++) {
    const previous = spine[i === 0 ? (closed ? spine.length - 1 : 0) : i - 1];
    const next = spine[i === spine.length - 1 ? (closed ? 0 : i) : i + 1];
    let dx = next.x - previous.x;
    let dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const half = spine[i].w / 2;
    left.push([spine[i].x - dy * half, spine[i].y + dx * half]);
    right.push([spine[i].x + dy * half, spine[i].y - dx * half]);
  }

  if (closed) {
    // Two contours, outer and inner: even-odd fill leaves the middle empty.
    return `${polyline(left)} Z ${polyline(right.reverse())} Z`;
  }
  return `${polyline(left)} ${polyline(right.reverse().map((p) => p))} Z`;
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
