/**
 * Draws the landing page's constellation into public/images/hero.svg.
 *
 * The drawing is a fragment of the Atlas, made by the same hand and the same
 * code: ink blots for subjects, crosses in circles for research, and thin ink
 * lines for what is joined to what. The shapes come from public/js/ink.js —
 * the very functions the map draws with — so the page you land on and the map
 * you land in are the same drawing at different scales.
 *
 * Positions are kept here as coordinates rather than as path data so the
 * composition stays editable: move a node, run `npm run draw`, and the lines
 * that join it follow.
 *
 * The frame is 1920x1080. index.html overlays its type on the same coordinates,
 * which is why the lines meet the title block and the Atlas button, and why the
 * middle of the frame is left clear.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INK, blobPath, rng, seedOf, washFor } from '../public/js/ink.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The subjects. `r` is the blot's reach, which stands in for how much sits
 * under it on the map: a big territory and a passing mention are the same mark
 * at different weights.
 */
const blots = {
  atlas: [250, 358, 74],
  soil: [138, 566, 32],
  water: [332, 622, 48],
  seed: [212, 790, 26],
  fibre: [424, 872, 40],
  ground: [604, 512, 30],
  hub: [958, 566, 62],
  city: [1302, 556, 44],
  climate: [1556, 196, 50],
  energy: [1724, 336, 66],
  material: [1452, 430, 24],
  reuse: [1826, 528, 32],
  commons: [1660, 796, 42],
  craft: [648, 944, 46],
  measure: [902, 1004, 22],
  living: [1256, 922, 58],
  place: [1486, 982, 30],
};

/** The research: plotted points on the network, the way the map draws them. */
const marks = [
  [470, 462, 13],
  [556, 706, 11],
  [1300, 716, 12],
  [1528, 634, 11],
  [336, 966, 11],
];

/** What is joined to what. */
const joins = [
  ['atlas', 'soil'], ['atlas', 'water'], ['atlas', 'ground'],
  ['soil', 'water'], ['water', 'seed'], ['seed', 'fibre'],
  ['fibre', 'craft'], ['craft', 'measure'], ['measure', 'living'],
  // The middle of the frame belongs to the buttons: the bottom of the network
  // is reached down the sides rather than straight through them.
  ['ground', 'hub'], ['hub', 'city'], ['ground', 'craft'], ['city', 'living'],
  ['city', 'material'], ['city', 'commons'], ['living', 'place'],
  ['material', 'climate'], ['climate', 'energy'], ['energy', 'reuse'],
  ['reuse', 'commons'], ['commons', 'place'], ['city', 'energy'],
];

/* --- the drawing ---------------------------------------------------------- */

const round = (v) => Math.round(v * 10) / 10;

/**
 * A line with a little bow in it. Straight lines between every pair would read
 * as a diagram; a hand does not draw two points without leaning slightly one
 * way. The lean is seeded, so it is the same every time the file is drawn.
 */
function joinPath(a, b, seed) {
  const random = rng(seedOf(seed));
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const lean = (random() - 0.5) * Math.min(length * 0.07, 34);
  const cx = (x1 + x2) / 2 - (dy / length) * lean;
  const cy = (y1 + y2) / 2 + (dx / length) * lean;
  return `M ${round(x1)} ${round(y1)} Q ${round(cx)} ${round(cy)} ${round(x2)} ${round(y2)}`;
}

/** The lines that reach out of the network to the type it sits around. */
const reaches = [
  joinPath(blots.hub, [1392, 436], 'blurb'),
  joinPath(blots.hub, [958, 664], 'atlas-button'),
  joinPath([958, 744], [958, 800], 'menu'),
  joinPath(blots.city, [1074, 702], 'atlas-right'),
  joinPath(blots.ground, [846, 700], 'atlas-left'),
];

const lines = [
  ...joins.map(([from, to]) => joinPath(blots[from], blots[to], `${from}-${to}`)),
  ...reaches,
];

const shapes = Object.entries(blots).map(([name, [x, y, r]], i) => {
  const d = blobPath(seedOf(`hero:${name}`), r, { lobes: 8, wobble: 0.85 });
  return `  <path fill="${washFor(i)}" transform="translate(${x} ${y})" d="${d}"/>`;
});

const crosses = marks.map(([x, y, r]) => {
  const arm = round(r * 0.82);
  return (
    `  <g><circle cx="${x}" cy="${y}" r="${r}"/>` +
    `<path d="M ${x - arm} ${y} H ${x + arm} M ${x} ${y - arm} V ${y + arm}"/></g>`
  );
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" fill="none" role="presentation">
<g stroke="${INK}" stroke-width="1.8" stroke-linecap="round">
${lines.map((d) => `  <path d="${d}"/>`).join('\n')}
</g>
<g>
${shapes.join('\n')}
</g>
<g stroke="${INK}" stroke-width="2.4" stroke-linecap="round">
${crosses.join('\n')}
</g>
</svg>
`;

const out = resolve(ROOT, 'public', 'images', 'hero.svg');
writeFileSync(out, svg);
console.log(
  `  drew ${shapes.length} blots, ${crosses.length} marks and ${lines.length} lines into ${out.replace(ROOT + '/', '')}`,
);
