/**
 * Pictures of the research, in ink.
 *
 * Every piece of research is shown with the picture its own page names for
 * itself, fetched through the Atlas (/api/image) and redrawn here in the two
 * colours the map is drawn in: ink dots on paper, error-diffused the way an
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

/** The picture for a piece of research, or null when it has none. */
export function pictureOf(url) {
  if (!url) return Promise.resolve(null);
  if (!pictures.has(url)) {
    pictures.set(
      url,
      fetch(`/api/image?for=${encodeURIComponent(url)}`)
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => (blob ? createImageBitmap(blob) : null))
        .catch(() => null),
    );
  }
  return pictures.get(url);
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
      pictureOf(url).then((bitmap) => (bitmap ? dither(bitmap, width, height) : null)),
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
