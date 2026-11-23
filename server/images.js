/**
 * Pictures for the research in the Atlas.
 *
 * Each piece of research is shown with a picture from its own page — a
 * photograph or a diagram, not a logo (see readImages in metadata.js) —
 * fetched by the Atlas and handed to the
 * browser from the Atlas' own address — which is what lets the page dither it
 * on a canvas, and what keeps a reader's browser from calling every site in
 * the library.
 *
 * Only for research that is in the published library: asked about any other
 * address, it answers that there is nothing, so it can never be used to fetch
 * whatever a stranger names.
 */

import { fetchImage, findImages } from './metadata.js';

/** The headers a picture is handed over with, from whichever server. */
export const IMAGE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'",
  'content-disposition': 'inline',
  // Held by the browser for a day and by the host's cache for a month: a
  // picture is looked for once, not once per visitor.
  'cache-control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800',
};

/** Asked about something the Atlas has no picture for: cached too, for less long. */
export const NONE_HEADERS = {
  'cache-control': 'public, max-age=3600, s-maxage=86400',
};

/**
 * What is said about a picture goes with it, in headers, so that it can be
 * credited where it is shown: the caption the page gives it, who made it when
 * the page says so, and the site it is from. `x-picture-more` says whether the
 * page has another picture to try after this one.
 */
export function pictureHeaders(picture) {
  const said = (value) => encodeURIComponent(String(value ?? '').slice(0, 240));
  return {
    'x-picture-caption': said(picture?.caption),
    'x-picture-credit': said(picture?.credit),
    'x-picture-site': said(picture?.site),
    'x-picture-more': picture?.more ? '1' : '0',
  };
}

/**
 * One of the pictures a piece of research's page offers — the `pick`th, from
 * nought, of those that might show it (see readImages in metadata.js) — as
 * { type, body, caption, credit, site, more }, or { more } alone when that one
 * cannot be had, or null when the page has none.
 *
 * `inLibrary` says whether a URL is a published piece of research; how that is
 * known differs between the local server and the host, so it is asked for.
 */
export async function imageFor(sourceUrl, inLibrary, { pick = 0, find = findImages, fetchOne = fetchImage } = {}) {
  const url = String(sourceUrl ?? '').trim();
  const n = Math.max(0, Math.min(Number.parseInt(pick, 10) || 0, 9));
  if (!url || url.length > 2000 || !(await inLibrary(url))) return null;
  try {
    const { site, candidates } = await find(url);
    const candidate = candidates[n];
    if (!candidate) return null;
    const more = n + 1 < candidates.length;
    const image = await fetchOne(candidate.src).catch(() => null);
    if (!image) return { more };
    return { ...image, caption: candidate.caption, credit: candidate.credit, site, more };
  } catch {
    return null;
  }
}
