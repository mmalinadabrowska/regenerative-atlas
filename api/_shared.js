/**
 * The small things every function on the host needs.
 *
 * These four files are the whole of the Atlas that runs on the web: the site
 * itself is static — a folder of pages and a baked snapshot of the library —
 * and the only thing it cannot do without a machine is take something in. So
 * the machine is four functions that live for a second each, and this is what
 * they share: reading a body, answering in JSON, and knowing their own address
 * so the link they put in an email points back at them.
 *
 * Nothing here is Vercel-specific beyond the (req, res) signature, which is
 * Node's own. The same files would run behind any host that speaks it.
 */

import { loadEnv } from '../server/env.js';

// Harmless where there is no file — a hosted function is configured by its
// environment, and that is exactly what loadEnv leaves alone.
loadEnv();

export function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    // No access-control header at all, deliberately: a submission is a write
    // and a review is a decision, and neither is something another site should
    // be able to read the answer to from a reader's browser. Saying nothing is
    // what refuses it; saying something permissive is what allows it.
  });
  res.end(text);
}

/** Read the request body, whether or not the host has already parsed it. */
export async function readBody(req, limit = 64 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new Error('That is a great deal more than a submission.');
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Where this function is answering from, so an emailed link comes back here
 * rather than to whichever deployment happened to be the last one built.
 * ATLAS_SITE_URL wins when it is set, which is how you pin the address to the
 * domain rather than to a preview build.
 */
export function siteUrl(req) {
  const pinned = (process.env.ATLAS_SITE_URL || '').replace(/\/+$/, '');
  if (pinned) return pinned;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  return `${proto}://${host}`;
}

/** The one-line refusal for a request that came in on the wrong verb. */
export function wrongMethod(req, res, allowed) {
  if (allowed.includes(req.method)) return false;
  res.writeHead(405, { allow: allowed.join(', '), 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Method not allowed.' }));
  return true;
}
