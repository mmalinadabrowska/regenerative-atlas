/**
 * The librarian's mark.
 *
 * A black disc with a fossil shell cut into it the way an old woodcut cuts one:
 * the shell's whole face worked in short horizontal strokes, and a whorl of
 * bands sweeping out from its middle where the knife took the hatching away.
 * The plate it is taken from prints black on white; here it is turned over, so
 * the strokes are paper on ink, like every other mark that stands on the map.
 *
 * Drawn from numbers rather than traced, from a fixed seed, so it is the same
 * shell everywhere it appears and it can be cut finer or coarser for the size
 * it is shown at: hatching at twenty pixels is a grey haze, and the bands are
 * the part that has to survive.
 */

import { rng } from './ink.js';

const TAU = Math.PI * 2;
const f = (n) => n.toFixed(2);

/**
 * The shell's outline: nearly round, a little fuller on the left, with the
 * notch at the top where the last whorl folds over the one before it.
 */
function edgeRadius(angle) {
  const up = -Math.PI / 2;
  const notch = Math.exp(-(((angle - (up + 0.32)) / 0.13) ** 2)) * 6.5;
  const lobe = Math.exp(-(((angle - (up - 0.45)) / 0.5) ** 2)) * 2.4;
  return 41 + lobe - notch + Math.cos(angle * 3 + 0.7) * 0.8;
}

function outline() {
  const steps = 120;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const angle = -Math.PI + (i / steps) * TAU;
    const r = edgeRadius(angle);
    d += `${i ? 'L' : 'M'}${f(Math.cos(angle) * r)} ${f(Math.sin(angle) * r)}`;
  }
  return `${d}Z`;
}

/**
 * The woodcut's ground: horizontal strokes across the whole face, each broken
 * where the block was worn or the knife skipped.
 */
function hatching(step, random) {
  let d = '';
  for (let y = -44; y <= 44; y += step) {
    let x = -46 + random() * 3;
    while (x < 46) {
      const length = 4 + random() * 13;
      const wobble = (random() - 0.5) * 0.7;
      d += `M${f(x)} ${f(y + wobble)}L${f(Math.min(x + length, 46))} ${f(y - wobble)}`;
      x += length + 1.2 + random() * 2.2;
    }
  }
  return d;
}

/** Where the whorl turns about: a little right of the middle, as on the plate. */
const EYE = [6, 2];

/**
 * The bands: each leaves the eye heading one way and bends round as it grows,
 * widening towards the rim. Most sweep out to the left and up into the lobe;
 * the last few turn down to the right, narrower.
 */
const BANDS = [
  { end: 250, bend: 125, width: 9 },
  { end: 222, bend: 125, width: 10.5 },
  { end: 194, bend: 120, width: 10 },
  { end: 166, bend: 112, width: 8 },
  { end: 136, bend: 100, width: 6 },
  { end: 106, bend: 88, width: 4.5 },
  { end: 78, bend: 76, width: 3.2 },
];

function band({ end, bend, width }, reach) {
  const steps = 24;
  const centre = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = ((end - bend * (1 - t) ** 1.8) * Math.PI) / 180;
    const r = 1.5 + t * reach;
    centre.push([EYE[0] + Math.cos(angle) * r, EYE[1] + Math.sin(angle) * r, t]);
  }
  const left = [];
  const right = [];
  centre.forEach(([x, y, t], i) => {
    const [px, py] = centre[Math.max(i - 1, 0)];
    const [nx, ny] = centre[Math.min(i + 1, steps)];
    const dx = nx - px;
    const dy = ny - py;
    const length = Math.hypot(dx, dy) || 1;
    const half = (width / 2) * t ** 0.85;
    left.push([x - (dy / length) * half, y + (dx / length) * half]);
    right.push([x + (dy / length) * half, y - (dx / length) * half]);
  });
  const points = [...left, ...right.reverse()];
  return `${points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('')}Z`;
}

let made = 0;

/**
 * The mark, as SVG markup.
 *
 * `size` is a hint about how big it will be shown, not a size: a small mark is
 * cut coarser — fewer, heavier strokes and fewer bands — so that it still
 * reads as a shell rather than as a grey button.
 */
export function librarianGlyph({ size = 'button', label = '' } = {}) {
  const small = size === 'small';
  const large = size === 'large';
  const id = `librarian-shell-${++made}`;
  const step = small ? 5.6 : large ? 2.9 : 3.9;
  const stroke = small ? 2.4 : large ? 1.2 : 1.7;
  const random = rng(1871);
  const bands = small ? BANDS.filter((_, i) => i % 2 === 0) : BANDS;
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  const shell = outline();

  return `<svg class="librarian-glyph" viewBox="-50 -50 100 100" ${aria} focusable="false">
    <defs><clipPath id="${id}"><path d="${shell}"/></clipPath></defs>
    <circle class="librarian-glyph__disc" r="50"/>
    <g clip-path="url(#${id})">
      <path class="librarian-glyph__lines" d="${hatching(step, random)}" fill="none"
            stroke-width="${stroke}" stroke-linecap="round"/>
      <g class="librarian-glyph__cut" stroke-width="${small ? 1.4 : 0.9}" stroke-linejoin="round">
        ${bands.map((spec) => `<path d="${band(spec, 46)}"/>`).join('')}
      </g>
    </g>
    <path class="librarian-glyph__lines" d="${shell}" fill="none" stroke-width="${small ? 3.4 : 2.6}"/>
  </svg>`;
}
