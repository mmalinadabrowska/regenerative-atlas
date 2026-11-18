/**
 * The picture for one piece of research, on the web: GET /api/image?for=<url>.
 *
 * The research has to be in the published library — the snapshot the map is
 * drawn from, shipped with this function (see includeFiles in vercel.json) — or
 * the answer is that there is no picture. See server/images.js.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { IMAGE_HEADERS, NONE_HEADERS, imageFor } from '../server/images.js';
import { wrongMethod } from './_shared.js';

// Beside this file in the repository; under the working directory once the
// host has packed the function. Both are tried.
const SNAPSHOTS = [
  new URL('../public/data/snapshot.json', import.meta.url),
  resolve(process.cwd(), 'public', 'data', 'snapshot.json'),
];

let published = null;

async function library() {
  if (published) return published;
  for (const path of SNAPSHOTS) {
    const text = await readFile(path, 'utf8').catch(() => null);
    if (!text) continue;
    published = new Set((JSON.parse(text).sources?.sources ?? []).map((source) => source.url));
    return published;
  }
  return new Set();
}

export default async function handler(req, res) {
  if (wrongMethod(req, res, ['GET', 'HEAD'])) return;
  const url = new URL(req.url, 'http://localhost').searchParams.get('for');
  const image = await imageFor(url, async (candidate) => (await library()).has(candidate));
  if (!image) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...NONE_HEADERS });
    return res.end('No picture.');
  }
  res.writeHead(200, { 'content-type': image.type, 'content-length': image.body.length, ...IMAGE_HEADERS });
  res.end(req.method === 'HEAD' ? undefined : image.body);
}
