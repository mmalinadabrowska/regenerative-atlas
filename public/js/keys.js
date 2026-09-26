/**
 * Turning a link into a key.
 *
 * The one rule for when two links are the same work: host without www, path
 * without a trailing slash, and none of the tracking parameters that ride along
 * on a shared link. It lives here, among the pages, because the browser needs
 * the same answer as the server — the Add page stops a duplicate before it is
 * sent, and it must agree with the server about what a duplicate is. The
 * server imports it from here (server/keys.js), so there is one copy of it.
 *
 * A pure function over a string: nothing to open, nothing to close.
 */

/**
 * Normalise a URL for de-duplication: same paper submitted twice, once with
 * tracking params and once without, should be one node on the map.
 */
export function urlKey(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl).trim());
  } catch {
    return String(rawUrl).trim().toLowerCase();
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const params = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (/^(utm_|fbclid|gclid|mc_cid|mc_eid|ref|source)/i.test(k)) continue;
    params.append(k, v);
  }
  params.sort();
  const query = params.toString();
  let path = u.pathname.replace(/\/+$/, '');
  if (path === '') path = '/';
  return `${host}${path}${query ? `?${query}` : ''}`;
}
