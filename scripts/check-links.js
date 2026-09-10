/**
 * Link rot is what kills a bibliography. This walks every URL in the Atlas —
 * or in data/seed.json with `--seed` — and reports anything that no longer
 * answers, so dead references can be repaired rather than quietly rotting.
 *
 *   node scripts/check-links.js          # everything in the database
 *   node scripts/check-links.js --seed   # the seed file, before it is loaded
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../server/db.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT = 20000;
const CONCURRENCY = 6;

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const headers = {
    'user-agent': 'Mozilla/5.0 (compatible; RegenerativeAtlas/0.1 link-check)',
    accept: 'text/html,application/xhtml+xml,*/*',
  };
  try {
    // Some publishers refuse HEAD outright, so fall back to a GET we abandon.
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal, headers });
    if (response.status === 405 || response.status === 403 || response.status === 501) {
      response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers });
    }
    return { url, status: response.status, finalUrl: response.url, ok: response.ok };
  } catch (error) {
    return { url, status: 0, ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function run(urls) {
  const results = [];
  const queue = urls.slice();
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const url = queue.shift();
      const result = await probe(url);
      results.push(result);
      const mark = result.ok ? '  ok  ' : ` ${String(result.status || 'ERR').padStart(4)} `;
      console.log(`${mark} ${url}${result.error ? `  (${result.error})` : ''}`);
    }
  });
  await Promise.all(workers);
  return results;
}

const useSeed = process.argv.includes('--seed');
const urls = useSeed
  ? JSON.parse(readFileSync(resolve(ROOT, 'data', 'seed.json'), 'utf8')).sources.map((s) => s.url)
  : (() => {
      const atlas = openDatabase();
      const list = atlas.listSources({ limit: 10000 }).map((s) => s.url);
      atlas.close();
      return list;
    })();

console.log(`checking ${urls.length} links…\n`);
const results = await run(urls);
const broken = results.filter((r) => !r.ok);
const moved = results.filter((r) => r.ok && r.finalUrl && r.finalUrl.replace(/\/$/, '') !== r.url.replace(/\/$/, ''));

console.log(`\n${results.length - broken.length}/${results.length} reachable`);
if (moved.length) {
  console.log(`\n${moved.length} redirected — consider updating:`);
  for (const r of moved) console.log(`  ${r.url}\n    -> ${r.finalUrl}`);
}
if (broken.length) {
  console.log(`\n${broken.length} unreachable:`);
  for (const r of broken) console.log(`  ${r.status || 'ERR'}  ${r.url}${r.error ? `  (${r.error})` : ''}`);
  process.exitCode = 1;
}
