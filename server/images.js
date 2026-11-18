/**
 * Pictures for the research in the Atlas.
 *
 * Each piece of research is shown with the picture its own page names for
 * itself (see readImage in metadata.js), fetched by the Atlas and handed to the
 * browser from the Atlas' own address — which is what lets the page dither it
 * on a canvas, and what keeps a reader's browser from calling every site in
 * the library.
 *
 * Only for research that is in the published library: asked about any other
 * address, it answers that there is nothing, so it can never be used to fetch
 * whatever a stranger names.
 */

import { fetchImage, findImage } from './metadata.js';

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
 * The picture for one piece of research, or null.
 *
 * `inLibrary` says whether a URL is a published piece of research; how that is
 * known differs between the local server and the host, so it is asked for.
 */
export async function imageFor(sourceUrl, inLibrary, { find = findImage, fetchOne = fetchImage } = {}) {
  const url = String(sourceUrl ?? '').trim();
  if (!url || url.length > 2000 || !(await inLibrary(url))) return null;
  try {
    const imageUrl = await find(url);
    return imageUrl ? await fetchOne(imageUrl) : null;
  } catch {
    return null;
  }
}
