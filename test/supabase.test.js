/**
 * The Supabase adapter, put against a stand-in PostgREST.
 *
 * The real project cannot be reached from a test run — it needs credentials
 * nobody should be committing — but the contract it answers on can be. This
 * fake speaks the parts of PostgREST the adapter uses and nothing else, and
 * records what it was asked, so the shape of every request is checked rather
 * than assumed: the upsert headers, the on_conflict targets, the paging.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../server/db.js';
import * as supabase from '../server/supabase.js';

function fakePostgrest({ sources = [], tags = [] } = {}) {
  const seen = [];
  let nextId = 100;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const table = url.pathname.replace('/rest/v1/', '');
    let body = '';
    for await (const chunk of req) body += chunk;
    seen.push({
      method: req.method,
      table,
      query: Object.fromEntries(url.searchParams),
      prefer: req.headers.prefer ?? '',
      key: req.headers.apikey ?? '',
      body: body ? JSON.parse(body) : null,
    });

    const answer = (value) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };

    if (req.method === 'GET' && table === 'sources') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 500);
      return answer(sources.slice(offset, offset + limit));
    }
    if (req.method === 'POST' && table === 'sources') return answer([{ id: 7 }]);
    if (req.method === 'POST' && table === 'tags') {
      return answer(JSON.parse(body).map((tag) => ({ id: (nextId += 1), slug: tag.slug })));
    }
    if (req.method === 'POST' && table === 'source_tags') return answer(null);
    if (req.method === 'GET' && table === 'tags') return answer(tags);

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'no such table' }));
  });

  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
      ready({ seen, close: () => server.close() });
    });
  });
}

const clearCredentials = () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_KEY;
  delete process.env.SUPABASE_ANON_KEY;
};

test('with no credentials the adapter simply is not there', () => {
  clearCredentials();
  assert.equal(supabase.configured(), false);
});

test('the project is named by its reference, not its whole URL', () => {
  clearCredentials();
  process.env.SUPABASE_URL = 'https://abcdefgh.supabase.co/';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  assert.equal(supabase.configured(), true);
  assert.equal(supabase.projectRef(), 'abcdefgh');
  clearCredentials();
});

test('a pull brings the library down and files it under the same tags', async () => {
  const { close } = await fakePostgrest({
    sources: [
      {
        url: 'https://example.org/soil',
        title: 'Soil and the city',
        authors: 'A Writer',
        publisher: 'Press',
        year: 2021,
        summary: 'Ground as a living body.',
        note: '',
        contributor: 'malina',
        created_at: '2024-01-01T00:00:00Z',
        source_tags: [{ tags: { slug: 'soil' } }, { tags: { slug: 'ecology' } }],
      },
    ],
  });

  const atlas = openDatabase(':memory:');
  const { fetched, added } = await supabase.pull(atlas);
  assert.equal(fetched, 1);
  assert.equal(added, 1);

  const [source] = atlas.listSources({ limit: 10 });
  assert.equal(source.title, 'Soil and the city');
  assert.deepEqual(source.tags.map((t) => t.slug).sort(), ['ecology', 'soil']);

  // Pulling again changes nothing: a source is one row per URL.
  const again = await supabase.pull(atlas);
  assert.equal(again.added, 0);
  assert.equal(atlas.count(), 1);

  atlas.close();
  close();
  clearCredentials();
});

test('a push upserts the source, its tags, and the ties between them', async () => {
  const { seen, close } = await fakePostgrest();

  await supabase.push({
    url: 'https://example.org/straw?utm_source=x',
    title: 'Straw',
    authors: '',
    year: 2019,
    tags: ['straw', 'materials'],
  });

  const [source, tags, ties] = seen;
  assert.equal(source.table, 'sources');
  assert.equal(source.query.on_conflict, 'url_key');
  assert.match(source.prefer, /merge-duplicates/);
  // The tracking parameter is off the key, so the same paper twice is one row.
  assert.equal(source.body[0].url_key, 'example.org/straw');
  assert.equal(source.key, 'test-key');

  assert.equal(tags.table, 'tags');
  assert.equal(tags.query.on_conflict, 'slug');
  assert.deepEqual(tags.body.map((t) => t.slug), ['straw', 'materials']);

  assert.equal(ties.table, 'source_tags');
  assert.equal(ties.body.length, 2);
  assert.ok(ties.body.every((tie) => tie.source_id === 7));

  close();
  clearCredentials();
});

test('a refusal from the project is reported with what it said', async () => {
  clearCredentials();
  process.env.SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  await assert.rejects(() => supabase.check());
  clearCredentials();
});
