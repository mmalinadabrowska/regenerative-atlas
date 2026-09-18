/**
 * Draws the landing page's constellation into public/images/hero.svg.
 *
 * The drawing is the map with the names taken off: ink blots for subjects,
 * gathered into themes the way the islands gather, and thin lines for what is
 * joined to what. The shapes come from public/js/ink.js — the very function the
 * map draws its tags with — so the page you land on and the map you land in are
 * one drawing. It is ink only: the map earns its colour by being explorable,
 * and on the landing page colour would be decoration.
 *
 * Nothing here is hand-placed except the themes' anchors and the ground kept
 * clear for the type. Everything else is generated from a seed, so the file
 * redraws identically and stays editable as intent rather than as path data.
 *
 * The frame is 1920x1080. index.html overlays its type on the same coordinates,
 * which is why the middle of the frame is left empty and why lines run to the
 * title block and the Atlas button.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INK, blobPath, rng, seedOf } from '../public/js/ink.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** What the type sits in, kept clear of marks. */
const reserved = [
  { x: 470, y: 96, w: 980, h: 360 },   // title, standfirst, blurb
  { x: 800, y: 640, w: 320, h: 120 },  // the Atlas button
  { x: 660, y: 780, w: 600, h: 96 },   // the section menu
];

/**
 * The themes. Each is an anchor with a spread and a handful of blots — one
 * territory, a couple of middling subjects and a scatter of small ones, which
 * is the shape of every island on the real map.
 */
const themes = [
  { at: [248, 334], spread: [142, 152], weights: [42, 27, 20, 15, 12, 10, 8, 7] },
  { at: [288, 800], spread: [146, 130], weights: [34, 23, 17, 13, 10, 8, 7] },
  { at: [946, 556], spread: [230, 78], weights: [32, 22, 16, 12, 10, 8, 7, 6] },
  { at: [1672, 272], spread: [156, 148], weights: [38, 25, 18, 14, 11, 9, 7, 6] },
  { at: [1598, 636], spread: [138, 114], weights: [28, 20, 15, 11, 9, 7, 6] },
  { at: [874, 962], spread: [206, 96], weights: [36, 24, 17, 13, 10, 8, 7, 6] },
  { at: [1446, 918], spread: [144, 102], weights: [30, 21, 15, 12, 9, 7, 6] },
];

/** Which themes are near enough to have something to do with each other. */
const bridges = [
  [0, 2], [0, 1], [1, 5], [2, 3], [2, 4], [4, 6], [5, 6], [3, 4],
];

/* --- placing the blots ---------------------------------------------------- */

const clear = (x, y, r) =>
  !reserved.some(
    (box) => x + r > box.x && x - r < box.x + box.w && y + r > box.y && y - r < box.y + box.h,
  );

const placed = [];

const islands = themes.map((theme, t) => {
  const random = rng(seedOf(`island:${t}`));
  const [ax, ay] = theme.at;
  const [sx, sy] = theme.spread;
  const blots = [];

  theme.weights.forEach((r, i) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      // The first blot holds the middle; the rest ring it at wandering angles,
      // pushed out further as they get smaller so the island reads as one thing
      // with an edge rather than as a pile.
      const angle = random() * Math.PI * 2;
      const reach = i === 0 ? random() * 0.12 : 0.3 + random() * 0.7;
      const x = ax + Math.cos(angle) * sx * reach;
      const y = ay + Math.sin(angle) * sy * reach;
      if (!clear(x, y, r + 10)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 10)) continue;
      const blot = { x, y, r, seed: `blot:${t}:${i}` };
      blots.push(blot);
      placed.push(blot);
      return;
    }
  });

  return blots;
});

/* --- joining them up ------------------------------------------------------ */

const round = (v) => Math.round(v * 10) / 10;

/** A line with a little bow in it — a hand does not join two points straight. */
function bow(a, b, seed) {
  const random = rng(seedOf(seed));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const lean = (random() - 0.5) * Math.min(length * 0.08, 30);
  return { cx: (a.x + b.x) / 2 - (dy / length) * lean, cy: (a.y + b.y) / 2 + (dx / length) * lean };
}

function joinPath(a, b, seed) {
  const { cx, cy } = bow(a, b, seed);
  return `M ${round(a.x)} ${round(a.y)} Q ${round(cx)} ${round(cy)} ${round(b.x)} ${round(b.y)}`;
}

/**
 * Does this line run through the type? Nothing may: a line crossing the title
 * or a button reads as a mistake rather than as a connection, and the whole
 * point of leaving the middle of the frame empty is that the words sit in a
 * clearing. The curve is walked rather than its ends tested, because a bowed
 * line can miss a box at both ends and still go straight through it.
 */
function crossesType(a, b, seed, probe = 3) {
  const { cx, cy } = bow(a, b, seed);
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const u = 1 - t;
    const x = u * u * a.x + 2 * u * t * cx + t * t * b.x;
    const y = u * u * a.y + 2 * u * t * cy + t * t * b.y;
    if (!clear(x, y, probe)) return true;
  }
  return false;
}

const lines = [];

// Inside an island: every blot hangs off the nearest one already joined up, so
// the island is connected without becoming a mesh.
islands.forEach((blots, t) => {
  blots.forEach((blot, i) => {
    if (i === 0) return;
    const nearest = blots
      .slice(0, i)
      .reduce((best, other) =>
        Math.hypot(other.x - blot.x, other.y - blot.y) < Math.hypot(best.x - blot.x, best.y - blot.y)
          ? other
          : best,
      );
    if (!crossesType(nearest, blot, `join:${t}:${i}`)) {
      lines.push(joinPath(nearest, blot, `join:${t}:${i}`));
    }
  });
});

// Between islands: the shortest pair, which is what a bridge would actually be.
for (const [from, to] of bridges) {
  const seed = `bridge:${from}:${to}`;
  const pairs = [];
  for (const a of islands[from]) {
    for (const b of islands[to]) pairs.push({ a, b, distance: Math.hypot(a.x - b.x, a.y - b.y) });
  }
  // The shortest crossing that keeps out of the type, rather than the shortest.
  const pair = pairs
    .sort((x, y) => x.distance - y.distance)
    .find(({ a, b }) => !crossesType(a, b, seed));
  if (pair) lines.push(joinPath(pair.a, pair.b, seed));
}

// And the lines that reach out of the network to the type it sits around. These
// stop at the edge of what they point at: a line that carries on through a
// button has stopped being a pointer and become a line through a button.
const centre = islands[2][0];
const reaches = [
  [centre, { x: 1404, y: 466 }, 'blurb'],
  [centre, { x: 958, y: 634 }, 'atlas-button'],
  [{ x: 958, y: 768 }, { x: 958, y: 778 }, 'menu'],
  [islands[4][0], { x: 1126, y: 700 }, 'atlas-right'],
  [islands[5][0], { x: 900, y: 882 }, 'menu-below'],
];

for (const [a, b, seed] of reaches) {
  // The endpoint is on the boundary of the type it points at, so the walk is
  // taken a hair short of it.
  // These are allowed to touch what they point at, so the walk stops short of
  // the endpoint and keeps to the line itself rather than a margin round it.
  const stop = { x: a.x + (b.x - a.x) * 0.94, y: a.y + (b.y - a.y) * 0.94 };
  if (crossesType(a, stop, seed, 0)) console.warn(`  the ${seed} line runs through the type`);
  lines.push(joinPath(a, b, seed));
}

/* --- the file ------------------------------------------------------------- */

const shapes = placed.map(
  (blot) =>
    `  <path transform="translate(${round(blot.x)} ${round(blot.y)})" d="${blobPath(
      seedOf(blot.seed),
      blot.r,
      { lobes: 8, wobble: 0.85 },
    )}"/>`,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" fill="none" role="presentation">
<g stroke="${INK}" stroke-width="1.3" stroke-linecap="round">
${lines.map((d) => `  <path d="${d}"/>`).join('\n')}
</g>
<g fill="${INK}">
${shapes.join('\n')}
</g>
</svg>
`;

const out = resolve(ROOT, 'public', 'images', 'hero.svg');
writeFileSync(out, svg);
console.log(
  `  drew ${shapes.length} blots in ${islands.length} islands and ${lines.length} lines into ${out.replace(ROOT + '/', '')}`,
);
