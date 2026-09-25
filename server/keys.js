/**
 * Turning a link into a key.
 *
 * Lives on its own, apart from the database that uses it, because the same
 * answer is needed in three places that have no business opening SQLite: the
 * Supabase adapter, the submission queue, and the functions that run on the
 * host with no disk at all. It is a pure function over a string — nothing to
 * open, nothing to close.
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
