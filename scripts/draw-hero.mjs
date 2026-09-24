/**
 * Draws the landing page's field into public/images/hero.svg.
 *
 * The map with the lines taken off. On the map the blots gather into islands
 * because their research shares a vocabulary; here they are simply scattered,
 * unsorted, the way a library looks before anyone has drawn it — which is what
 * the button in the middle of them is for. Two marks, both the map's own: an
 * ink blot for a theme, washed in the map's palette and outlined in ink, and a
 * cross in a circle for a piece of research.
 *
 * The shapes come from public/js/ink.js, the very functions the map draws with,
 * and the strokes are declared non-scaling so that a blot's outline is the same
 * weight here as it is on the map however large the drawing is printed.
 *
 * Nothing is hand-placed except the ground kept clear for the type. Everything
 * else is generated from a seed, so the file redraws identically and stays
 * editable as intent rather than as path data.
 *
 * The frame is 1920x1080 and the type is centred on it, which is why the boxes
 * below run down the middle.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INK, WASH_COUNT, blobPath, rng, seedOf, washFor } from '../public/js/ink.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1920;
const H = 1080;

/** What the type sits in, kept clear of marks. All centred on the frame. */
const reserved = [
  { x: 460, y: 0, w: 1000, h: 396 },   // wordmark, standfirst, blurb
  { x: 780, y: 590, w: 360, h: 130 },  // the Atlas button
  { x: 600, y: 740, w: 720, h: 120 },  // the curator line
];

/** Where marks may fall: a cloud down the middle, thinning at the edges. */
const field = { x: 370, y: 404, w: 1180, h: 636 };

const clear = (x, y, r) =>
  !reserved.some(
    (box) => x + r > box.x && x - r < box.x + box.w && y + r > box.y && y - r < box.y + box.h,
  );

/* --- scattering ----------------------------------------------------------- */

const random = rng(seedOf('landing field'));
const placed = [];

/**
 * A place for one mark: inside the field, off the type, and not touching what
 * is already down. Density falls towards the edges, so the cloud has a middle
 * without being a circle — the pull is on the horizontal only, since the field
 * is twice as wide as it is deep and an even scatter would read as a band.
 */
function findSpot(r, gap) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const bias = (random() + random() + random()) / 3; // three dice: a soft middle
    const x = field.x + bias * field.w;
    const y = field.y + random() * field.h;
    if (!clear(x, y, r + 14)) continue;
    if (x - r < 0 || x + r > W || y - r < 0 || y + r > H) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + gap)) continue;
    return { x, y };
  }
  return null;
}

/* The blots: a few large, more middling, most small — the distribution of a
   vocabulary, where a handful of subjects carry most of the library. */
const sizes = [
  31, 28, 26, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 15, 14,
  13, 13, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7,
];

const blots = [];
sizes.forEach((r, i) => {
  const spot = findSpot(r, 30);
  if (!spot) return;
  // Every fifth one is left unpainted: a theme nothing has been filed under
  // yet is still a shape on the map, and the field should show that it is a
  // library with room in it.
  const empty = i % 5 === 3;
  const blot = { ...spot, r, seed: `field:blot:${i}`, wash: empty ? 'none' : washFor((i * 7) % WASH_COUNT) };
  blots.push(blot);
  placed.push(blot);
});

/* The research: the same mark it wears on the map, at two sizes, plotted into
   the gaps the blots left. */
const crosses = [];
for (let i = 0; i < 19; i++) {
  const r = i % 3 === 0 ? 11 : 6.5;
  const spot = findSpot(r, 26);
  if (!spot) continue;
  crosses.push({ ...spot, r });
  placed.push({ ...spot, r });
}

/* --- the file ------------------------------------------------------------- */

const round = (v) => Math.round(v * 10) / 10;

const blotMarks = blots.map(
  (blot) =>
    `  <path fill="${blot.wash}" transform="translate(${round(blot.x)} ${round(blot.y)})" d="${blobPath(
      seedOf(blot.seed),
      blot.r,
      { lobes: 8, wobble: 0.85 },
    )}"/>`,
);

// The arms stop short of the ring, or at small sizes the cross closes the
// circle up and the whole mark reads as a dot. Same rule as ink.js draws by.
const crossMarks = crosses.map(({ x, y, r }) => {
  const arm = round(r * 0.82);
  return `  <g transform="translate(${round(x)} ${round(y)})">
    <circle r="${round(r)}"/>
    <path d="M 0 ${-arm} V ${arm} M ${-arm} 0 H ${arm}"/>
  </g>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" role="presentation">
<!-- Non-scaling strokes: the outline of a blot is the same weight here as it
     is on the map, whatever size the drawing is laid out at. -->
<g stroke="${INK}" stroke-width="1.1" vector-effect="non-scaling-stroke">
${blotMarks.join('\n')}
</g>
<g stroke="${INK}" stroke-width="1.1" stroke-linecap="round" vector-effect="non-scaling-stroke">
${crossMarks.join('\n')}
</g>
</svg>
`;

const out = resolve(ROOT, 'public', 'images', 'hero.svg');
writeFileSync(out, svg);
console.log(
  `  drew ${blotMarks.length} blots and ${crossMarks.length} research marks into ${out.replace(ROOT + '/', '')}`,
);
