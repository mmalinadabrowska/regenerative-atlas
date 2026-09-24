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
 * The *positions* are the design's rather than a seed's — see below. Only the
 * shape of each blot is generated, from a seed, so the file redraws identically
 * and stays editable as intent rather than as path data.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INK, WASH_COUNT, blobPath, seedOf, washFor } from '../public/js/ink.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1920;
const H = 1080;

/*
 * The layout is the design's.
 *
 * Every mark is written down where it stands in the drawing this page was
 * designed from — a 1273x789 sheet — and mapped onto the 1920x1080 frame by the
 * one anchor the two share: the middle of the Atlas button. Both axes take the
 * same scale, so the field keeps its proportions rather than being stretched to
 * fit a wider frame, and the clearings left around the type arrive with it.
 *
 * A scatter from a seed kept producing a field that was even where the design
 * is not: the design crowds the middle, thins to one or two marks at the far
 * left and right, and leaves a lane for the line about who tends it. That is
 * composition, and it does not come out of a random number generator.
 */
const SHEET = { button: { x: 635, y: 463 } };
const SCALE = W / 1273;
const HERE = { x: 960, y: 654 }; // where the button's middle falls in our frame

/**
 * What the type actually occupies in this frame, measured off the page rather
 * than guessed: the design's sheet is a different shape from ours, so a mark
 * faithfully placed can still land on a line of type that runs lower here than
 * it did there.
 */
const reserved = [
  { x: 461, y: 108, w: 998, h: 293 },  // wordmark, standfirst, blurb
  { x: 822, y: 610, w: 276, h: 92 },   // the Atlas button
  { x: 576, y: 740, w: 768, h: 68 },   // the curator's line
];

const MARGIN = 16;

/**
 * Put a mark out of the words, the shortest way, keeping the composition.
 * Dropping it instead would leave a hole where the design has a mark; pushing
 * it the long way would put it somewhere the design never had one.
 */
function keepClear(mark) {
  for (const box of reserved) {
    // A stretched blot reaches further down than its radius says.
    const reach = (mark.guard ?? mark.r) + MARGIN;
    const left = box.x - reach;
    const right = box.x + box.w + reach;
    const top = box.y - reach;
    const bottom = box.y + box.h + reach;
    if (mark.x <= left || mark.x >= right || mark.y <= top || mark.y >= bottom) continue;
    const ways = [
      { d: mark.x - left, move: () => (mark.x = left) },
      { d: right - mark.x, move: () => (mark.x = right) },
      { d: mark.y - top, move: () => (mark.y = top) },
      { d: bottom - mark.y, move: () => (mark.y = bottom) },
    ];
    ways.sort((a, b) => a.d - b.d)[0].move();
    moved += 1;
  }
  return mark;
}

let moved = 0;

const at = (x, y) => ({
  x: HERE.x + (x - SHEET.button.x) * SCALE,
  y: HERE.y + (y - SHEET.button.y) * SCALE,
});

/**
 * The blots, read off the design: x, y and radius in its own pixels.
 * `wash: false` leaves one unpainted — a theme nothing has been filed under yet
 * is still a shape, and the field should look like a library with room in it.
 * `tall` stretches a blot the way several of them are drawn, taller than wide.
 */
const design = [
  [633, 295, 9, { tall: 1.25 }],
  [737, 341, 12],
  [532, 369, 9],
  [476, 382, 10, { wash: false, tall: 1.15 }],
  [851, 385, 9],
  [840, 420, 10, { tall: 1.3 }],
  [335, 441, 10, { tall: 1.35 }],
  [420, 461, 12],
  [808, 458, 13],
  [855, 456, 9],
  [381, 531, 8],
  [905, 545, 6, { wash: false }],
  [829, 572, 8],
  [399, 603, 5, { wash: false }],
  [444, 633, 17],
  [852, 628, 18],
  [740, 657, 8, { wash: false, tall: 1.4 }],
  [583, 667, 9],
  [1013, 500, 6, { wash: false }],
  [993, 627, 5],
];

const blots = design.map(([x, y, r, options = {}], i) => keepClear({
  ...at(x, y),
  r: r * SCALE,
  guard: r * SCALE * (options.tall ?? 1),
  tall: options.tall ?? 1,
  seed: `field:blot:${i}`,
  wash: options.wash === false ? 'none' : washFor((i * 7) % WASH_COUNT),
}));

/** The research marks, at the two sizes the design draws them. */
const crosses = [
  [732, 299, 4], [521, 318, 4], [805, 337, 4], [407, 358, 8],
  [633, 367, 8], [932, 412, 4], [521, 439, 4], [467, 497, 4],
  [745, 602, 8], [380, 631, 4], [517, 637, 8], [816, 627, 4],
  [713, 643, 4], [418, 686, 4],
].map(([x, y, r]) => keepClear({ ...at(x, y), r: r * SCALE }));

/* --- the drift ------------------------------------------------------------ */

/*
 * The field breathes, the way the map's islands do.
 *
 * On the map each blot wanders a few pixels around where the simulation left
 * it, on its own slow period: cos(t * rate) across and sin(t * rate * 0.8)
 * down, which is a Lissajous figure rather than a circle — the two axes never
 * quite come back into step, so no two marks ever trace the same loop.
 *
 * The same figure, in CSS, out of two animations on two elements: the outer
 * one sways across, the inner one down, on a period a quarter longer. They
 * compose, and 1 : 1.25 is the map's 1 : 0.8 the other way up. The easing is
 * the sine curve's own bezier, so the marks are slowest at the ends of the
 * swing, as a pendulum is.
 *
 * It lives inside the SVG because the SVG is loaded as an image: script cannot
 * reach in there, and does not have to — this is CSS, and CSS in an image runs.
 *
 * What does not run in there is a media query about the reader. An SVG loaded
 * as an image is rendered in its own world and asked for reduced motion it
 * answers no, whatever the reader has actually asked for — measured, not
 * assumed. So the still version is a second file, and the page chooses between
 * the two with a <picture> whose own media attribute is evaluated where the
 * preference lives.
 */
const DRIFT = `<style>
  .x { animation: swayX var(--t) cubic-bezier(0.37, 0, 0.63, 1) var(--d) infinite; }
  .y { animation: swayY var(--ty) cubic-bezier(0.37, 0, 0.63, 1) var(--dy) infinite; }

  @keyframes swayX {
    from, to { translate: var(--ax) 0; }
    50%      { translate: calc(var(--ax) * -1) 0; }
  }

  @keyframes swayY {
    from, to { transform: translateY(var(--ay)); }
    50%      { transform: translateY(calc(var(--ay) * -1)); }
  }

  @media (prefers-reduced-motion: reduce) {
    .x, .y { animation: none; }
  }
</style>`;

/**
 * One mark's share of the drift: how far it wanders, how long it takes, and
 * how far through that it already is. Small marks move less than large ones —
 * a sway the width of its own body reads as a jitter rather than as a breath —
 * and the phases come from the seed, so the field never pulses in unison.
 *
 * The swing is about seven pixels on a laptop at the widest, which is roughly
 * what a blot on the map moves; the field should be as alive as the thing it
 * is a picture of. Short enough periods that a reader who stops to look sees
 * it happen, long enough that it never asks to be watched.
 */
function drift(seed, r) {
  const n = (salt, span) => (seedOf(`${seed}:${salt}`) % span) / span;
  const across = 4.6 + r * 0.2;
  const period = 18 + n('t', 1000) * 14;
  return (
    `--ax:${round(across)}px;--ay:${round(across * 0.78)}px;` +
    `--t:${round(period)}s;--ty:${round(period * 1.25)}s;` +
    `--d:-${round(n('d', 1000) * period)}s;--dy:-${round(n('e', 1000) * period * 1.25)}s`
  );
}

/* --- the file ------------------------------------------------------------- */

const round = (v) => Math.round(v * 10) / 10;

const blotMarks = blots.map((blot) => {
  const stretch = blot.tall === 1 ? '' : ` transform="scale(1 ${round(blot.tall)})"`;
  return `  <g class="x" transform="translate(${round(blot.x)} ${round(blot.y)})" style="${drift(
    blot.seed,
    blot.r,
  )}"><g class="y"><path fill="${blot.wash}"${stretch} d="${blobPath(seedOf(blot.seed), blot.r, {
    lobes: 8,
    wobble: 0.85,
  })}"/></g></g>`;
});

// The arms stop short of the ring, or at small sizes the cross closes the
// circle up and the whole mark reads as a dot. Same rule as ink.js draws by.
const crossMarks = crosses.map(({ x, y, r }, i) => {
  const arm = round(r * 0.82);
  return `  <g class="x" transform="translate(${round(x)} ${round(y)})" style="${drift(
    `field:cross:${i}`,
    r,
  )}"><g class="y">
    <circle r="${round(r)}"/>
    <path d="M 0 ${-arm} V ${arm} M ${-arm} 0 H ${arm}"/>
  </g></g>`;
});

const draw = (drift) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" role="presentation">
${drift ? `${DRIFT}\n` : ''}<!-- Non-scaling strokes: the outline of a blot is the same weight here as it
     is on the map, whatever size the drawing is laid out at. -->
<g stroke="${INK}" stroke-width="1.1" vector-effect="non-scaling-stroke">
${blotMarks.join('\n')}
</g>
<g stroke="${INK}" stroke-width="1.1" stroke-linecap="round" vector-effect="non-scaling-stroke">
${crossMarks.join('\n')}
</g>
</svg>
`;

const images = resolve(ROOT, 'public', 'images');
writeFileSync(resolve(images, 'hero.svg'), draw(true));
writeFileSync(resolve(images, 'hero-still.svg'), draw(false));
console.log(
  `  drew ${blotMarks.length} blots and ${crossMarks.length} research marks into ` +
    `public/images/hero.svg and hero-still.svg` +
    `${moved ? ` (${moved} nudged off the type)` : ''}`,
);
