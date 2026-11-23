/**
 * Pictures of the research, in ink.
 *
 * Every piece of research is shown with a picture from its own page — a
 * photograph or a diagram, never its logo — fetched through the Atlas
 * (/api/image) and redrawn here in the two colours the map is drawn in: ink
 * dots on paper, error-diffused the way an
 * old newspaper half-tone or a Macintosh screen did it. A photograph of a
 * building and a cover of a report come out in the same hand, and the same
 * hand as the map — which is the point of redrawing them at all.
 *
 * Atkinson's dither rather than Floyd–Steinberg's: it passes on only three
 * quarters of the error, so the lights blow out to paper and the darks fill to
 * ink, and what is left in between is a texture rather than a grey.
 */

import { INK, PAPER } from './ink.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const [INK_R, INK_G, INK_B] = rgb(INK);
const [PAPER_R, PAPER_G, PAPER_B] = rgb(PAPER);

/** Decoded pictures, by research URL: fetched once a visit, however often shown. */
const pictures = new Map();

/** The most pictures of one page tried before giving up on it. */
const MOST_TRIED = 6;

/**
 * The picture for a piece of research, or null when it has none: as
 * { bitmap, caption, credit, site }. Its page may offer several; they are
 * tried in the order the Atlas ranks them (see readImages in
 * server/metadata.js), and the first that looks like a photograph or a
 * diagram, rather than a logo or a line of type, is the one.
 */
export function pictureOf(url) {
  if (!url) return Promise.resolve(null);
  if (!pictures.has(url)) pictures.set(url, firstPicture(url).catch(() => null));
  return pictures.get(url);
}

/** What is said about a piece of research's picture — caption, credit, site — or null. */
export async function creditOf(url) {
  const picture = await pictureOf(url);
  return picture ? { caption: picture.caption, credit: picture.credit, site: picture.site } : null;
}

const said = (response, name) => {
  try {
    return decodeURIComponent(response.headers.get(name) ?? '').trim();
  } catch {
    return '';
  }
};

async function firstPicture(url) {
  for (let pick = 0; pick < MOST_TRIED; pick++) {
    const response = await fetch(`/api/image?for=${encodeURIComponent(url)}${pick ? `&pick=${pick}` : ''}`);
    const more = response.headers.get('x-picture-more') === '1';
    if (response.ok) {
      const bitmap = await response.blob().then((blob) => createImageBitmap(blob)).catch(() => null);
      if (bitmap && looksLikeAPicture(bitmap)) {
        return {
          bitmap,
          caption: said(response, 'x-picture-caption'),
          credit: said(response, 'x-picture-credit'),
          site: said(response, 'x-picture-site'),
        };
      }
    }
    if (!more) return null;
  }
  return null;
}

/**
 * Whether a picture is a photograph or a diagram rather than a mark: a logo,
 * an icon, a name or a title set in type, a page of text.
 *
 * A photograph is many colours, none of them most of the picture. A mark is a
 * few flat colours, mostly one — the ground it is set on — with what is drawn
 * on it gathered in one place: a block or a line in the middle. A diagram is
 * a few flat colours too, but what is drawn on it reaches across the whole of
 * it. A page of text reaches across the whole of it as well, but in rows: ink,
 * paper, ink, paper, down the page, as no drawing is.
 */
export function looksLikeAPicture(source) {
  const m = measurePicture(source);
  if (!m) return false;
  if (m.colours > 40 && m.ground < 0.3) return true; // a photograph
  if (m.ground < 0.2) return true; // too busy to be a mark
  if (m.drawn < 0.03) return false; // all but blank
  if (m.lines >= 8 && m.colours <= 24) return false; // rows of type
  return m.reached >= 0.5 && m.wide >= 0.6 && m.tall >= 0.55;
}

/** The measures looksLikeAPicture goes by; null for a picture too small or thin to be one. */
export function measurePicture(source) {
  if (source.width < 200 || source.height < 140) return null;
  const ratio = source.width / source.height;
  if (ratio > 3.2 || ratio < 1 / 3.2) return null;

  // Drawn small, but tall: rows of type stay apart at this height.
  const W = 128;
  const H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const N = W * H;

  // Colours, to five bits a channel.
  const counts = new Map();
  const bins = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const bin = ((px[i * 4] >> 3) << 10) | ((px[i * 4 + 1] >> 3) << 5) | (px[i * 4 + 2] >> 3);
    bins[i] = bin;
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  let covered = 0;
  let colours = 0;
  while (covered < N * 0.9) covered += ranked[colours++][1];
  const [groundBin, groundCount] = ranked[0];

  // What is drawn: anything more than a step from the ground's colour.
  const off = (bin) =>
    Math.abs((bin >> 10) - (groundBin >> 10)) > 1 ||
    Math.abs(((bin >> 5) & 31) - ((groundBin >> 5) & 31)) > 1 ||
    Math.abs((bin & 31) - (groundBin & 31)) > 1;
  const G = 8;
  const cells = new Int32Array(G * G);
  const rows = new Int32Array(H);
  let drawn = 0;
  let left = W;
  let right = -1;
  let top = H;
  let bottom = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!off(bins[y * W + x])) continue;
      drawn += 1;
      rows[y] += 1;
      cells[Math.floor((y * G) / H) * G + Math.floor((x * G) / W)] += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  // Rows of type: runs of drawn-on rows with clear rows between them.
  let lines = 0;
  let inked = false;
  for (let y = 0; y < H; y++) {
    const now = rows[y] > W * 0.02;
    if (now && !inked) lines += 1;
    inked = now;
  }
  const cell = (W / G) * (H / G);
  return {
    colours,
    ground: groundCount / N,
    drawn: drawn / N,
    reached: cells.filter((n) => n >= cell * 0.03).length / (G * G),
    wide: right < 0 ? 0 : (right - left + 1) / W,
    tall: bottom < 0 ? 0 : (bottom - top + 1) / H,
    lines,
  };
}

/** Answered without waiting, for the ones already known to have none. */
const drawn = new Map();

/**
 * The picture for a piece of research, dithered into a canvas `width` by
 * `height` CSS pixels, cropped to fill it. Null when there is no picture.
 * One dot is one CSS pixel: on a sharp screen each is a crisp square of two or
 * three device pixels, which is what makes it read as print.
 */
export async function ditheredPicture(url, width, height) {
  const key = `${url} ${width}x${height}`;
  if (!drawn.has(key)) {
    drawn.set(
      key,
      pictureOf(url).then((picture) => (picture ? dither(picture.bitmap, width, height) : null)),
    );
  }
  const canvas = await drawn.get(key);
  if (!canvas) return null;
  // A copy each time it is asked for, so one picture can stand in two places.
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d').drawImage(canvas, 0, 0);
  return copy;
}

/** Draw a picture into a canvas of the given size, cropped to fill it, in ink and paper. */
export function dither(source, width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Cover: the picture fills the frame and the overflow is cut, from the middle.
  const scale = Math.max(w / source.width, h / source.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
  }

  // Levels: the darkest and lightest few per cent are set to ink and paper, so
  // a hazy photograph and a crisp diagram both use the whole range.
  const sorted = Float32Array.from(lum).sort();
  const low = sorted[Math.floor(sorted.length * 0.02)];
  const high = sorted[Math.floor(sorted.length * 0.98)];
  const span = Math.max(high - low, 1);
  for (let i = 0; i < lum.length; i++) {
    const t = Math.min(Math.max((lum[i] - low) / span, 0), 1);
    lum[i] = 255 * t ** 0.9;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const ink = lum[i] < 128;
      const error = (lum[i] - (ink ? 0 : 255)) / 8;
      for (const [dx, dy] of [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < w && ny < h) lum[ny * w + nx] += error;
      }
      px[i * 4] = ink ? INK_R : PAPER_R;
      px[i * 4 + 1] = ink ? INK_G : PAPER_G;
      px[i * 4 + 2] = ink ? INK_B : PAPER_B;
      px[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
