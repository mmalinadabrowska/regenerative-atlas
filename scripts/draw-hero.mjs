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
  { x: 764, y: 608, w: 392, h: 91 },   // the way in — 'Open the Atlas'
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
    // A stretched blot reaches further down than its radius says, and a mark
    // that orbits reaches a swing's width further in every direction.
    const reach = (mark.guard ?? mark.r) + (mark.swing ?? 0) + MARGIN;
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
/**
 * How wide a mark's orbit is. Further out from the button means a wider circle,
 * the way the outer track of anything turning is the longer one, and a bigger
 * mark carries a little more than a small one so the field does not read as
 * grit blowing about. Known before the marks are placed, because what a mark
 * sweeps through is part of what has to be kept off the words.
 */
const swingOf = (x, y, r) => 8 + r * 0.2 + Math.hypot(x - HERE.x, y - HERE.y) * 0.012;

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
  swing: swingOf(at(x, y).x, at(x, y).y, r * SCALE),
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
].map(([x, y, r]) => keepClear({ ...at(x, y), r: r * SCALE, swing: swingOf(at(x, y).x, at(x, y).y, r * SCALE) }));

/* --- the drift ------------------------------------------------------------ */

/*
 * The field turns around the way in.
 *
 * Every mark travels a small circle, all of them the same way round and at
 * nearly the same rate — and each one starts at the point of its circle that
 * matches where it sits around the button. Set like that the circles compose:
 * the field reads as one slow current going round 'Open the Atlas' rather than
 * as twenty marks each fidgeting on its own. Nothing travels far — a mark ends
 * every lap where it began, so the composition read off the design sheet is
 * still the composition, and the words stay in the clear.
 *
 * A circle, in CSS, out of two animations on two elements: the outer one moves
 * across, the inner one down, on the same period with the inner one a quarter
 * of a lap behind. Across is the cosine and down is the sine, which is a
 * circle. The easing is the sine curve's own bezier, so each axis is slowest at
 * the ends of its swing, which is what makes the pair come out round rather
 * than square.
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
  .y { animation: swayY var(--t) cubic-bezier(0.37, 0, 0.63, 1) var(--dy) infinite; }

  @keyframes swayX {
    from, to { translate: var(--a) 0; }
    50%      { translate: calc(var(--a) * -1) 0; }
  }

  @keyframes swayY {
    from, to { transform: translateY(var(--a)); }
    50%      { transform: translateY(calc(var(--a) * -1)); }
  }

  @media (prefers-reduced-motion: reduce) {
    .x, .y { animation: none; }
  }
</style>`;

/**
 * One mark's share of the turn: how wide its circle is, how long a lap takes,
 * and how far round it already is.
 *
 * The phase is the mark's own bearing from the button, so at any moment the
 * whole field is at the same point of its rotation — that is what makes twenty
 * separate circles read as one thing going round. The periods differ by a few
 * seconds across the field, which keeps it from locking into a wheel, and the
 * laps are short enough that somebody arriving on the page sees it moving
 * rather than has to wait to be shown.
 */
function drift(seed, r, x, y) {
  const n = (salt, span) => (seedOf(`${seed}:${salt}`) % span) / span;
  const across = swingOf(x, y, r);
  const period = 11 + n('t', 1000) * 4;
  // Its bearing from the button, as a fraction of a lap, played back as a
  // head start. Negative, so the animation begins already that far in.
  const bearing = (Math.atan2(y - HERE.y, x - HERE.x) / (Math.PI * 2) + 1) % 1;
  const start = -(bearing * period + n('d', 1000) * 0.5);
  return (
    `--a:${round(across)}px;--t:${round(period)}s;` +
    `--d:${round(start)}s;--dy:${round(start - period / 4)}s`
  );
}

/* --- the file ------------------------------------------------------------- */

const round = (v) => Math.round(v * 10) / 10;

const blotMarks = blots.map((blot) => {
  const stretch = blot.tall === 1 ? '' : ` transform="scale(1 ${round(blot.tall)})"`;
  return `  <g class="x" transform="translate(${round(blot.x)} ${round(blot.y)})" style="${drift(
    blot.seed,
    blot.r,
    blot.x,
    blot.y,
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
    x,
    y,
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
