/**
 * The Regenerative Atlas server.
 *
 * No framework and no dependencies: a Node http server, a small router, and
 * the public/ directory served as-is. `node server/index.js` is the whole
 * install story, which matters for something meant to be forked and self-hosted
 * by people who are designers first.
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { ApiError, exportBibtex, exportJson, handlers } from './api.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
};

const MAX_BODY = 64 * 1024;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const sendJson = (res, status, value) => send(res, status, value);

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, 'That is more than the Atlas will accept in one go.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolvePromise({});
      try {
        resolvePromise(JSON.parse(raw));
      } catch {
        reject(new ApiError(400, 'That request body was not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * A plain token bucket per address. Not a defence against a determined actor —
 * that is what a reverse proxy is for — but enough that one enthusiastic script
 * cannot fill the map before anyone notices.
 */
function createLimiter({ capacity, refillPerMinute }) {
  const buckets = new Map();
  return function take(key) {
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: capacity, at: now };
    const refill = ((now - bucket.at) / 60000) * refillPerMinute;
    bucket.tokens = Math.min(capacity, bucket.tokens + refill);
    bucket.at = now;
    if (bucket.tokens < 1) {
      buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    if (buckets.size > 5000) buckets.clear();
    return true;
  };
}

const submitLimit = createLimiter({ capacity: 12, refillPerMinute: 4 });
const describeLimit = createLimiter({ capacity: 20, refillPerMinute: 20 });

const clientKey = (req) =>
  (req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress ?? 'unknown').trim();

async function serveStatic(req, res, pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(PUBLIC, relative);
  if (!filePath.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });

  let info = await stat(filePath).catch(() => null);
  if (info?.isDirectory()) {
    filePath = join(filePath, 'index.html');
    info = await stat(filePath).catch(() => null);
  }
  // Pretty URLs: /themes serves public/themes.html
  if (!info && !extname(filePath)) {
    filePath += '.html';
    info = await stat(filePath).catch(() => null);
  }
  if (!info?.isFile()) {
    const fallback = join(PUBLIC, '404.html');
    const has404 = await stat(fallback).catch(() => null);
    if (has404?.isFile()) {
      res.writeHead(404, { 'content-type': MIME['.html'] });
      return createReadStream(fallback).pipe(res);
    }
    return send(res, 404, { error: 'Not found' });
  }

  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const cache = /\.(woff2?|otf|ttf|png|jpg|svg|webp)$/i.test(filePath)
    ? 'public, max-age=604800'
    : 'no-cache';
  res.writeHead(200, {
    'content-type': type,
    'content-length': info.size,
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  return createReadStream(filePath).pipe(res);
}

export function createAtlasServer(atlas) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const { pathname, searchParams } = url;

    try {
      if (pathname.startsWith('/api/')) {
        if (req.method === 'GET' || req.method === 'HEAD') {
          switch (pathname) {
            case '/api/health':
              return sendJson(res, 200, { ok: true, sources: atlas.count() });
            case '/api/vocabulary':
              return sendJson(res, 200, handlers.vocabulary());
            case '/api/tags':
              return sendJson(res, 200, handlers.tags(atlas));
            case '/api/sources':
              return sendJson(res, 200, handlers.sources(atlas, searchParams));
            case '/api/graph':
              return sendJson(res, 200, handlers.graph(atlas, searchParams));
            case '/api/stats':
              return sendJson(res, 200, handlers.stats(atlas));
            case '/api/export.json':
              return send(res, 200, JSON.stringify(exportJson(atlas), null, 2), {
                'content-disposition': 'attachment; filename="regenerative-atlas.json"',
              });
            case '/api/export.bib':
              return send(res, 200, exportBibtex(atlas), {
                'content-type': 'text/plain; charset=utf-8',
                'content-disposition': 'attachment; filename="regenerative-atlas.bib"',
              });
            default:
              return sendJson(res, 404, { error: 'No such endpoint.' });
          }
        }

        if (req.method === 'POST') {
          const body = await readBody(req);
          if (pathname === '/api/describe') {
            if (!describeLimit(clientKey(req))) {
              return sendJson(res, 429, { error: 'Slow down a moment — too many lookups.' });
            }
            return sendJson(res, 200, await handlers.describe(atlas, body));
          }
          if (pathname === '/api/sources') {
            if (!submitLimit(clientKey(req))) {
              return sendJson(res, 429, {
                error: 'That is a lot of sources at once. Take a breath and try again shortly.',
              });
            }
            const result = handlers.submit(atlas, body);
            return sendJson(res, result.created ? 201 : 200, result);
          }
          return sendJson(res, 404, { error: 'No such endpoint.' });
        }

        return sendJson(res, 405, { error: 'Method not allowed.' });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendJson(res, 405, { error: 'Method not allowed.' });
      }
      return await serveStatic(req, res, pathname === '/' ? '/index.html' : pathname);
    } catch (error) {
      if (error instanceof ApiError || typeof error?.status === 'number') {
        return sendJson(res, error.status ?? 400, { error: error.message, details: error.details });
      }
      console.error('[atlas]', error);
      return sendJson(res, 500, { error: 'Something went wrong at our end.' });
    }
  });
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const atlas = openDatabase();
  const server = createAtlasServer(atlas);
  server.listen(PORT, HOST, () => {
    console.log(`\n  Regenerative Atlas`);
    console.log(`  ${atlas.count()} sources · http://localhost:${PORT}\n`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(() => {
        atlas.close();
        process.exit(0);
      });
    });
  }
}
