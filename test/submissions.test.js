/**
 * The way in: what happens between a stranger pressing the button and the
 * curator deciding.
 *
 * Neither end of this can be reached from a test run — there is no Supabase
 * project and no mail account here, and there should not be — but both speak a
 * contract, and a contract can be stood in for. Below: a PostgREST that keeps
 * the queue in an array, and a mail provider that keeps what it was asked to
 * send. Everything in between is the real code, including the functions that
 * run on the host, called the way the host calls them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

import * as supabase from '../server/supabase.js';
import { compose } from '../server/notify.js';
import submitFunction from '../api/sources.js';
import reviewFunction from '../api/review.js';
import healthFunction from '../api/health.js';

/** A PostgREST that keeps a queue, a library, and nothing it was not asked to. */
function fakeProject({ published = [] } = {}) {
  const queue = [];
  const written = [];
  let nextId = 500;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const table = url.pathname.replace('/rest/v1/', '');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;

    const answer = (value, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };

    // ?column=eq.value — the only filter this fake has to understand.
    const eq = (column) => {
      const value = url.searchParams.get(column);
      return value?.startsWith('eq.') ? decodeURIComponent(value.slice(3)) : null;
    };

    if (table === 'submissions' && req.method === 'GET') {
      let rows = queue;
      for (const column of ['url_key', 'status', 'token']) {
        const wanted = eq(column);
        if (wanted !== null) rows = rows.filter((row) => String(row[column]) === wanted);
      }
      return answer(rows);
    }
    if (table === 'submissions' && req.method === 'POST') {
      const rows = body.map((row) => ({ id: (nextId += 1), status: 'pending', created_at: '2026-01-01T00:00:00Z', reviewed_at: null, source_id: null, ...row }));
      queue.push(...rows);
      return answer(rows);
    }
    if (table === 'submissions' && req.method === 'PATCH') {
      const token = eq('token');
      const rows = queue.filter((row) => row.token === token);
      for (const row of rows) Object.assign(row, body);
      return answer(rows);
    }
    if (table === 'sources' && req.method === 'GET') {
      const key = eq('url_key');
      return answer(published.filter((row) => row.url_key === key));
    }
    if (table === 'sources' && req.method === 'POST') {
      written.push(...body);
      return answer([{ id: 42 }]);
    }
    if (table === 'tags' && req.method === 'POST') {
      return answer(body.map((tag) => ({ id: (nextId += 1), slug: tag.slug })));
    }
    if (table === 'source_tags') return answer(null);
    return answer({ message: `no such table: ${table}` }, 404);
  });

  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => {
      process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
      ready({ queue, written, close: () => server.close() });
    });
  });
}

/** A mail provider that accepts everything and remembers all of it. */
function fakeMail({ failing = false } = {}) {
  const sent = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    sent.push({ auth: req.headers.authorization, ...JSON.parse(raw) });
    if (failing) {
      res.writeHead(422, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ message: 'the sender is not verified' }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'mail_1' }));
  });

  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => {
      process.env.ATLAS_MAIL_API = `http://127.0.0.1:${server.address().port}`;
      process.env.ATLAS_MAIL_KEY = 'test-mail-key';
      process.env.ATLAS_NOTIFY_TO = 'curator@example.org';
      ready({ sent, close: () => server.close() });
    });
  });
}

/** A request and a response of the shape a host hands a function. */
function call(handler, { method = 'GET', url = '/', body } = {}) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = url;
  req.headers = { host: 'atlas.example', 'x-forwarded-proto': 'https' };

  return new Promise((done) => {
    let status = 0;
    let headers = {};
    const res = {
      writeHead(code, given) {
        status = code;
        headers = given ?? {};
        return res;
      },
      end(text) {
        done({ status, headers, body: text ? JSON.parse(text) : null });
      },
    };
    Promise.resolve(handler(req, res)).catch((error) => done({ status: 500, headers, body: { error: error.message } }));
  });
}

const clearEnvironment = () => {
  for (const key of [
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_KEY', 'SUPABASE_ANON_KEY',
    'ATLAS_MAIL_API', 'ATLAS_MAIL_KEY', 'ATLAS_NOTIFY_TO', 'ATLAS_SITE_URL',
  ]) delete process.env[key];
};

const entry = {
  url: 'https://example.org/ground?utm_source=newsletter',
  title: 'Ground as a living body',
  authors: 'A Writer',
  publisher: 'Press',
  year: '2021',
  summary: 'What soil asks of the people who build on it.',
  note: 'The clearest thing I have read on the subject.',
  contributor: 'sam@example.org',
  tags: ['soil', 'uk'],
};

test('a submission is queued, not published, and the curator is told', async () => {
  clearEnvironment();
  const project = await fakeProject();
  const mail = await fakeMail();

  const answer = await call(submitFunction, { method: 'POST', url: '/api/sources', body: entry });

  assert.equal(answer.status, 202);
  assert.equal(answer.body.queued, true);
  assert.equal(answer.body.told, true);
  // The token is the key to the entry. It goes to the inbox and nowhere else.
  assert.equal(JSON.stringify(answer.body).includes('token'), false);

  assert.equal(project.queue.length, 1);
  assert.equal(project.queue[0].status, 'pending');
  // Tracking parameters are off the key, so the same paper arriving by another
  // route is the same paper.
  assert.equal(project.queue[0].url_key, 'example.org/ground');
  // Everything is somewhere: a record that named no place is global.
  assert.deepEqual(project.queue[0].tags.sort(), ['europe', 'soil', 'uk']);
  assert.equal(project.written.length, 0, 'nothing reaches the library without a decision');

  assert.equal(mail.sent.length, 1);
  const [message] = mail.sent;
  assert.deepEqual(message.to, ['curator@example.org']);
  assert.equal(message.auth, 'Bearer test-mail-key');
  assert.match(message.subject, /Ground as a living body/);
  assert.match(message.text, /https:\/\/atlas\.example\/review\/\?token=/);
  assert.match(message.text, new RegExp(project.queue[0].token.replace(/[-_]/g, '\\$&')));
  // A reply reaches whoever sent it, when they left an address rather than a name.
  assert.equal(message.reply_to, 'sam@example.org');

  project.close();
  mail.close();
  clearEnvironment();
});

test('the same link twice waits once', async () => {
  clearEnvironment();
  const project = await fakeProject();
  const mail = await fakeMail();

  await call(submitFunction, { method: 'POST', url: '/api/sources', body: entry });
  const second = await call(submitFunction, {
    method: 'POST',
    url: '/api/sources',
    body: { ...entry, url: 'https://www.example.org/ground/' },
  });

  assert.equal(second.status, 200);
  assert.equal(second.body.alreadyWaiting, true);
  assert.equal(project.queue.length, 1);
  assert.equal(mail.sent.length, 1, 'the curator is not asked the same question twice');

  project.close();
  mail.close();
  clearEnvironment();
});

test('a link already on the map is not queued at all', async () => {
  clearEnvironment();
  const project = await fakeProject({
    published: [{ id: 3, url_key: 'example.org/ground', title: 'Ground as a living body' }],
  });
  const mail = await fakeMail();

  const answer = await call(submitFunction, { method: 'POST', url: '/api/sources', body: entry });

  assert.equal(answer.status, 200);
  assert.equal(answer.body.alreadyInAtlas.title, 'Ground as a living body');
  assert.equal(project.queue.length, 0);
  assert.equal(mail.sent.length, 0);

  project.close();
  mail.close();
  clearEnvironment();
});

test('the field no person can see is what stops the machines', async () => {
  clearEnvironment();
  const project = await fakeProject();
  const mail = await fakeMail();

  const answer = await call(submitFunction, {
    method: 'POST',
    url: '/api/sources',
    body: { ...entry, website: 'http://buy-things.example' },
  });

  // Thanked, and dropped. Saying no is what teaches it to come back.
  assert.equal(answer.status, 202);
  assert.equal(project.queue.length, 0);
  assert.equal(mail.sent.length, 0);

  project.close();
  mail.close();
  clearEnvironment();
});

test('a submission with no tags is refused before anything is written', async () => {
  clearEnvironment();
  const project = await fakeProject();
  const answer = await call(submitFunction, {
    method: 'POST',
    url: '/api/sources',
    body: { ...entry, tags: [] },
  });

  assert.equal(answer.status, 400);
  assert.match(answer.body.error, /at least one tag/i);
  assert.equal(project.queue.length, 0);

  project.close();
  clearEnvironment();
});

test('with no project to write to the contributor is told, not thanked', async () => {
  clearEnvironment();
  const answer = await call(submitFunction, { method: 'POST', url: '/api/sources', body: entry });
  assert.equal(answer.status, 503);
  assert.match(answer.body.error, /nowhere to keep this/i);
});

test('mail that fails does not fail the submission', async () => {
  clearEnvironment();
  const project = await fakeProject();
  const mail = await fakeMail({ failing: true });

  const answer = await call(submitFunction, { method: 'POST', url: '/api/sources', body: entry });

  assert.equal(answer.status, 202);
  assert.equal(answer.body.queued, true);
  assert.equal(answer.body.told, false, 'and the answer is honest about it');
  assert.equal(project.queue.length, 1, 'the entry is kept either way');

  project.close();
  mail.close();
  clearEnvironment();
});

test('the review link reads one entry and nothing else', async () => {
  clearEnvironment();
  const project = await fakeProject();
  const mail = await fakeMail();
  await call(submitFunction, { method: 'POST', url: '/api/sources', body: entry });
  const { token } = project.queue[0];

  const found = await call(reviewFunction, { url: `/api/review?token=${encodeURIComponent(token)}` });
  assert.equal(found.status, 200);
  assert.equal(found.body.entry.title, 'Ground as a living body');
  assert.equal(found.body.waiting, 1);

  const missing = await call(reviewFunction, { url: '/api/review?token=not-a-token' });
  assert.equal(missing.status, 404);

  const unaddressed = await call(reviewFunction, { url: '/api/review' });
  assert.equal(unaddressed.status, 400);

  project.close();
  mail.close();
  clearEnvironment();
});

test('accepting writes it into the library, with the vocabulary’s own words', async () => {
  clearEnvironment();
  const project = await fakeProject();
  const mail = await fakeMail();
  await call(submitFunction, { method: 'POST', url: '/api/sources', body: entry });
  const { token } = project.queue[0];

  const decided = await call(reviewFunction, {
    method: 'POST',
    url: '/api/review',
    body: { token, decision: 'accept' },
  });

  assert.equal(decided.status, 200);
  assert.equal(decided.body.decision, 'accept');
  assert.equal(project.queue[0].status, 'accepted');
  assert.equal(project.queue[0].source_id, 42);

  assert.equal(project.written.length, 1);
  assert.equal(project.written[0].title, 'Ground as a living body');
  assert.equal(project.written[0].url_key, 'example.org/ground');
  assert.equal(project.written[0].status, 'published');

  // Deciding twice is not an error, and does not write twice.
  const again = await call(reviewFunction, {
    method: 'POST',
    url: '/api/review',
    body: { token, decision: 'accept' },
  });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /accepted already/);
  assert.equal(project.written.length, 1);

  project.close();
  mail.close();
  clearEnvironment();
});

test('declining writes nothing anywhere', async () => {
  clearEnvironment();
  const project = await fakeProject();
  const mail = await fakeMail();
  await call(submitFunction, { method: 'POST', url: '/api/sources', body: entry });
  const { token } = project.queue[0];

  const decided = await call(reviewFunction, {
    method: 'POST',
    url: '/api/review',
    body: { token, decision: 'decline' },
  });

  assert.equal(decided.status, 200);
  assert.equal(decided.body.decision, 'decline');
  assert.equal(project.queue[0].status, 'declined');
  assert.equal(project.written.length, 0);

  project.close();
  mail.close();
  clearEnvironment();
});

test('a decision is a POST, because scanners follow links', async () => {
  clearEnvironment();
  const project = await fakeProject();
  const mail = await fakeMail();
  await call(submitFunction, { method: 'POST', url: '/api/sources', body: entry });
  const { token } = project.queue[0];

  // The shape an email client's prefetch would take: a GET at the review
  // address, with the decision in the query. It reads, and changes nothing.
  const looked = await call(reviewFunction, { url: `/api/review?token=${token}&decision=accept` });
  assert.equal(looked.status, 200);
  assert.equal(project.queue[0].status, 'pending');
  assert.equal(project.written.length, 0);

  project.close();
  mail.close();
  clearEnvironment();
});

test('the health endpoint says what is wired up, and never what the keys are', async () => {
  clearEnvironment();
  const project = await fakeProject();
  const mail = await fakeMail();

  const answer = await call(healthFunction, { url: '/api/health' });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.accepting, true);
  assert.equal(answer.body.telling, true);
  assert.equal(answer.body.library.waiting, 0);
  assert.deepEqual(answer.body.notifications.to, ['cu…@example.org']);
  assert.equal(JSON.stringify(answer.body).includes('test-mail-key'), false);
  assert.equal(JSON.stringify(answer.body).includes('test-key'), false);

  project.close();
  mail.close();
  clearEnvironment();
});

test('the notification carries everything a decision needs', () => {
  const message = compose(
    { ...entry, year: 2021, tags: ['soil', 'uk', 'europe'] },
    { reviewUrl: 'https://atlas.example/review/?token=abc' },
  );

  assert.match(message.subject, /Ground as a living body/);
  for (const expected of [
    'Ground as a living body',
    'A Writer · Press · 2021',
    'https://example.org/ground',
    'Soil',
    'UK',
    'What soil asks of the people who build on it.',
    'The clearest thing I have read on the subject.',
    'https://atlas.example/review/?token=abc',
  ]) {
    assert.ok(message.text.includes(expected), `the plain text should say: ${expected}`);
    assert.ok(message.html.includes(expected.replace(/·/g, '·')), `the page should say: ${expected}`);
  }
  // Places are named apart from themes, because they are read apart.
  assert.match(message.text, /Grounded in\s+(UK, Europe|Europe, UK)/);
});

test('a contributor’s words cannot become markup in the curator’s inbox', () => {
  const message = compose({
    url: 'https://example.org/x',
    title: '<script>alert(1)</script>',
    summary: 'Ends with "<b>" & more',
    tags: ['soil'],
    contributor: '<img onerror=alert(1)>',
  });

  assert.equal(message.html.includes('<script>'), false);
  assert.ok(message.html.includes('&lt;script&gt;'));
  assert.equal(message.html.includes('<img onerror'), false);
  assert.ok(message.html.includes('&amp; more'));
});

test('a name that is not an address is not used as a reply address', () => {
  assert.equal(compose({ url: 'https://a.example', title: 'T', tags: [], contributor: 'malina' }).replyTo, undefined);
  assert.equal(
    compose({ url: 'https://a.example', title: 'T', tags: [], contributor: 'm@example.org' }).replyTo,
    'm@example.org',
  );
});

test('the queue is reached only through the adapter, and needs credentials', async () => {
  clearEnvironment();
  await assert.rejects(() => supabase.submission('anything'), /No Supabase credentials/);
});
