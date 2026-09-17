/**
 * Draws the landing page's constellation into public/images/hero.svg.
 *
 * The marks are kept here as centrelines rather than as path data so they stay
 * editable — move a point, run `npm run draw`, and the drawing updates. Every
 * mark is a brush stroke from public/js/ink.js, so the landing page and the map
 * are made by the same hand.
 *
 * The frame is 1920x1080. index.html overlays its type on the same coordinates,
 * which is why the connecting lines meet the title block and the Map button.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INK, brushStroke, washFor } from '../public/js/ink.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const marks = [];

/**
 * Every mark is washed in its own colour, in the order it is drawn — the ramp in
 * ink.js puts consecutive marks most of a wheel apart, so neighbours on the page
 * never rhyme. Pass `wash: INK` for a mark that should stay ink; the lines that
 * join the drawing up are ink either way.
 */
const paint = (attrs, { wash, ...options }) => [
  `  <path fill="${wash ?? washFor(marks.length)}"${attrs}`,
  options,
];

/** An open brush mark: a centreline, tapered at both ends unless told otherwise. */
const mark = (points, options = {}) => {
  const [open, brush] = paint('', options);
  marks.push(`${open} d="${brushStroke(points, brush)}"/>`);
};

/** A closed brush mark: a hollow ring, the blob shapes of the drawing. */
const ring = (points, options = {}) => {
  const [open, brush] = paint(' fill-rule="evenodd"', options);
  marks.push(`${open} d="${brushStroke(points, { closed: true, ...brush })}"/>`);
};

/**
 * A closed contour: one radius per step around a centre. Uneven radii are the
 * whole point — an even ring reads as a plotted ellipse, and nothing in Miró is
 * an ellipse.
 */
const contour = (cx, cy, radii, { rotate = 0, squash = 1 } = {}) =>
  radii.map((r, i) => {
    const angle = rotate + (i / radii.length) * Math.PI * 2;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r * squash];
  });

/** A hollow star: alternating long and short radii, each one a little off. */
const starContour = (cx, cy, outer, inner, options) =>
  contour(cx, cy, outer.flatMap((r, i) => [r, inner[i]]), options);

/* — top left: the largest mark on the page ——————————————————————— */

ring(
  starContour(
    252,
    384,
    [102, 78, 96, 70, 88],
    [30, 24, 33, 26, 28],
    { rotate: -1.15 },
  ),
  { width: 8 },
);

/* — left: the crown ————————————————————————————————————————— */

mark(
  [[302, 646], [296, 592], [300, 552], [318, 532], [336, 546], [340, 590],
   [346, 546], [360, 538], [368, 566], [360, 612], [352, 648]],
  { widths: [11, 15, 15, 13, 11, 9, 9, 12, 14, 15, 10] },
);

/* — left: two small marks below —————————————————————————————— */

ring(contour(199, 774, [22, 17, 21, 16, 20, 18]), { width: 8 });
mark(
  [[352, 748], [382, 750], [398, 772], [388, 798], [362, 800], [354, 782]],
  { widths: [9, 13, 14, 13, 11, 8] },
);

/* — centre: the hub the Map sits under ————————————————————————— */

ring(
  starContour(938, 598, [74, 56, 68, 52, 62], [22, 18, 24, 19, 21], { rotate: -0.5 }),
  { width: 8 },
);
mark([[986, 566], [1030, 528], [1062, 516]], { widths: [12, 8, 4] });

/* — upper right: the loose cluster beside the title ————————————— */

mark([[1412, 146], [1424, 176], [1414, 208]], { widths: [7, 12, 6] });
mark([[1726, 162], [1748, 124], [1786, 114], [1810, 132]], { widths: [7, 14, 14, 8] });

// A hand of upright forms, the densest corner of the drawing.
mark([[1690, 320], [1682, 272], [1696, 240], [1718, 250], [1720, 292]], { widths: [9, 14, 14, 12, 8] });
mark([[1780, 246], [1798, 280], [1792, 322], [1770, 332]], { widths: [8, 14, 13, 8] });
ring(
  contour(
    1710,
    392,
    // Gentle undulation, not alternation — alternating radii make spikes.
    [66, 62, 57, 61, 67, 60, 55, 59, 65, 62, 56, 61],
    { rotate: 0.35, squash: 0.84 },
  ),
  { width: 10 },
);
mark([[1642, 300], [1636, 268], [1650, 246]], { widths: [7, 11, 6] });

/* — right and below: the scattered small marks ——————————————— */

mark(
  [[1248, 880], [1256, 818], [1274, 784], [1292, 812], [1302, 876]],
  { widths: [9, 15, 14, 14, 9] },
);
// A zigzag. The points are doubled so the spline turns a corner instead of
// rounding one off.
mark(
  [[1468, 750], [1468, 750], [1524, 726], [1524, 726], [1482, 758], [1482, 758], [1548, 734]],
  { widths: [5, 5, 8, 8, 8, 8, 5] },
);
mark(
  [[1136, 914], [1112, 914], [1102, 930], [1114, 948], [1136, 946]],
  { widths: [7, 12, 12, 11, 7] },
);
ring(
  contour(
    804,
    958,
    [70, 66, 58, 50, 47, 51, 60, 67, 65, 57, 50, 52],
    { rotate: 0.1, squash: 0.66 },
  ),
  { width: 10 },
);
mark(
  [[1250, 946], [1282, 936], [1306, 960], [1296, 992], [1264, 996]],
  { widths: [8, 13, 14, 12, 7] },
);

/* — the lines that make it a map rather than a scatter ——————————— */

const lines = [
  '  <path d="M 388 604 L 878 600"/>',
  '  <path d="M 996 588 C 1120 560, 1260 470, 1378 396"/>',
  '  <path d="M 878 768 L 877 792"/>',
  '  <path d="M 1104 748 L 1248 802"/>',
  '  <path d="M 1276 886 L 1278 940"/>',
  '  <path d="M 1386 748 L 1452 740"/>',
  '  <path d="M 348 468 L 356 500"/>',
  '  <path d="M 262 748 L 288 706"/>',
  '  <path d="M 348 688 L 354 720" stroke-dasharray="2 9"/>',
];

// The drawing is loaded as an <img>, which cannot inherit currentColor, so both
// the ink and the washes are baked in. Ink is the group's default; a mark with a
// wash carries its own fill.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" fill="none" role="presentation">
<g stroke="${INK}" stroke-width="2.2" stroke-linecap="round">
${lines.join('\n')}
</g>
<g fill="${INK}">
${marks.join('\n')}
</g>
</svg>
`;

const out = resolve(ROOT, 'public', 'images', 'hero.svg');
writeFileSync(out, svg);
console.log(`  drew ${marks.length} marks and ${lines.length} lines into ${out.replace(ROOT + '/', '')}`);
