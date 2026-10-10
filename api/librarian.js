/**
 * The librarian, on the web.
 *
 * The question comes in; the library it is answered from is the published
 * snapshot — the same file the map is drawn from, built hourly from the live
 * library — so the librarian can only ever point at what a visitor can find on
 * the map. It is shipped with the function (see includeFiles in vercel.json)
 * rather than fetched, because a preview deployment behind a login cannot
 * fetch its own pages.
 *
 * The model key is ANTHROPIC_API_KEY in the host's environment variables, and
 * nowhere else. Without it the function answers by keyword, as the local
 * server does.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LibrarianError, librarian, rateLimiter } from '../server/librarian.js';
import { json, readBody, wrongMethod } from './_shared.js';

// Beside this file in the repository; under the working directory once the
// host has packed the function. Both are tried.
const SNAPSHOTS = [
  new URL('../public/data/snapshot.json', import.meta.url),
  resolve(process.cwd(), 'public', 'data', 'snapshot.json'),
];

let library = null;

async function sources() {
  if (library) return library;
  for (const path of SNAPSHOTS) {
    const text = await readFile(path, 'utf8').catch(() => null);
    if (!text) continue;
    library = JSON.parse(text).sources?.sources ?? [];
    return library;
  }
  throw new Error('The published library could not be read.');
}

const allowed = rateLimiter({ limit: 5, windowMs: 60_000 });

const clientKey = (req) =>
  String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown')
    .split(',')[0]
    .trim();

export default async function handler(req, res) {
  if (wrongMethod(req, res, ['POST'])) return;

  if (!allowed(clientKey(req))) {
    return json(res, 429, { error: 'One question at a time — try again in a minute.' });
  }

  const body = await readBody(req, 8 * 1024).catch(() => null);

  try {
    return json(res, 200, await librarian(body, await sources()));
  } catch (error) {
    if (error instanceof LibrarianError) return json(res, error.status, { error: error.message });
    console.error('librarian:', error);
    return json(res, 500, { error: 'The librarian could not answer just now. Try again in a moment.' });
  }
}
