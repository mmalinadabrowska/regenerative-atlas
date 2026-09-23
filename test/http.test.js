import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { createAtlasServer } from '../server/index.js';

let server;
let base;
let atlas;

before(async () => {
  atlas = openDatabase(':memory:');
  atlas.addSource({
    url: 'https://example.org/first',
    title: 'The first source',
    tags: ['soil', 'essay'],
    contributor: 'mal',
  });
  server = createAtlasServer(atlas);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  atlas.close();
});

const get = (path) => fetch(`${base}${path}`);
const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('health reports the size of the library', async () => {
  const response = await get('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, sources: 1 });
});

test('the read endpoints answer as JSON', async () => {
  for (const path of ['/api/vocabulary', '/api/tags', '/api/sources', '/api/graph', '/api/stats']) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /application\/json/, path);
    await response.json();
  }
});

test('every page is served, with or without its trailing slash', async () => {
  const paths = [
    '/', '/map/', '/themes/', '/add/', '/about/',
    '/map', '/themes', '/add', '/about',
    '/styles/atlas.css', '/js/ink.js',
  ];
  for (const path of paths) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
  }
  assert.equal((await get('/map/')).headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal((await get('/js/ink.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
});

test('an unknown page answers 404 with the Atlas 404 page', async () => {
  const response = await get('/no-such-place');
  assert.equal(response.status, 404);
  assert.match(await response.text(), /Regenerative Atlas/);
});

test('an unknown API endpoint answers 404 as JSON, not HTML', async () => {
  const response = await get('/api/nothing');
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);
});

test('paths cannot climb out of the public directory', async () => {
  for (const path of [
    '/../server/db.js',
    '/..%2f..%2fserver%2fdb.js',
    '/js/../../package.json',
    '/%2e%2e/%2e%2e/package.json',
  ]) {
    const response = await get(path);
    assert.notEqual(response.status, 200, `${path} escaped the public directory`);
  }
});

test('a valid submission is created and shows up on the map', async () => {
  const response = await post('/api/sources', {
    url: 'https://example.org/second',
    title: 'Grown structures',
    tags: ['mycelium', 'Bio-Based'],
    contributor: 'tester',
  });
  assert.equal(response.status, 201);
  const { created, source } = await response.json();
  assert.equal(created, true);
  assert.deepEqual(new Set(source.tags.map((t) => t.slug)), new Set(['mycelium', 'bio-based']));

  const graph = await (await get('/api/graph')).json();
  assert.ok(graph.nodes.some((n) => n.label === 'Grown structures'));
});

test('a repeat submission answers 200, not 201, and does not duplicate', async () => {
  const response = await post('/api/sources', {
    url: 'https://example.org/second',
    title: 'Grown structures',
    tags: ['materials'],
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).created, false);
});

test('an invalid submission answers 400 with a readable message', async () => {
  const response = await post('/api/sources', { url: 'https://example.org/third' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /tag/i);
});

test('a malformed body answers 400 rather than crashing the server', async () => {
  const response = await fetch(`${base}/api/sources`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.equal(response.status, 400);
  assert.equal((await get('/api/health')).status, 200);
});

test('describe refuses to fetch a private address', async () => {
  const response = await post('/api/describe', { url: 'http://127.0.0.1:1/secret' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /public web/i);
});

test('exports are offered as downloads', async () => {
  const json = await get('/api/export.json');
  assert.match(json.headers.get('content-disposition'), /regenerative-atlas\.json/);
  assert.ok((await json.json()).sources.length >= 2);

  const bib = await get('/api/export.bib');
  assert.match(bib.headers.get('content-type'), /text\/plain/);
  assert.match(await bib.text(), /^@/m);
});

test('write methods are refused on read-only endpoints', async () => {
  const response = await fetch(`${base}/api/tags`, { method: 'DELETE' });
  assert.equal(response.status, 405);
});

test('responses carry a nosniff header', async () => {
  assert.equal((await get('/api/health')).headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await get('/')).headers.get('x-content-type-options'), 'nosniff');
});
