import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS,
  LibrarianError,
  MODEL,
  catalogueOf,
  catalogueText,
  consult,
  consultOffline,
  librarian,
  rateLimiter,
  readAnswer,
  readQuestion,
  requestBody,
} from '../server/librarian.js';

const tag = (slug, label = slug) => ({ slug, label, facet: 'theme' });

/** Three records, the shape both the snapshot and the local database give. */
const SOURCES = [
  {
    url: 'https://example.org/straw',
    title: 'Building with straw',
    authors: 'A. Builder',
    year: 2019,
    summary: 'Straw bale walls in social housing.',
    tags: [tag('straw', 'Straw'), tag('carbon', 'Carbon')],
  },
  {
    url: 'https://example.org/retrofit',
    title: 'Deep retrofit of a school',
    summary: 'A 1960s school brought up to standard without demolition.',
    tags: [tag('retrofit', 'Retrofit'), tag('carbon', 'Carbon')],
  },
  { url: 'https://example.org/soil', title: 'Soil and the city', tags: [tag('soil', 'Soil')] },
];

/** A reply from the Messages API, as fetch would hand it back. */
const reply = (body, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const message = (answer, extra = {}) => ({
  type: 'message',
  role: 'assistant',
  stop_reason: 'end_turn',
  content: [
    { type: 'thinking', thinking: '', signature: 'x' },
    { type: 'text', text: JSON.stringify(answer) },
  ],
  ...extra,
});

test('the catalogue gives every record a short key and carries what it says about itself', () => {
  const catalogue = catalogueOf(SOURCES);
  assert.deepEqual(catalogue.map((entry) => entry.key), ['S1', 'S2', 'S3']);
  const text = catalogueText(catalogue);
  assert.match(text, /\[S1\] Building with straw/);
  assert.match(text, /Tags: Straw, Carbon/);
  assert.match(text, /Summary: Straw bale walls/);
});

test('a question has to be there, and has to be a question rather than a document', () => {
  assert.throws(() => readQuestion({ question: '   ' }), LibrarianError);
  assert.throws(() => readQuestion({ question: 'x'.repeat(LIMITS.question + 1) }), /under 600/);
  assert.equal(readQuestion({ question: '  straw   and\nclay ' }), 'straw and clay');
});

test('the answer is held to the catalogue: invented keys, repeats and empty groups are dropped', () => {
  const answer = readAnswer(
    {
      in_scope: true,
      reply: 'Two themes.',
      groups: [
        { title: 'Low carbon walls', reasoning: 'Both.', sources: ['S1', 's2', 'S1', 'S99'] },
        { title: 'Invented', reasoning: 'None of these exist.', sources: ['S42'] },
      ],
    },
    catalogueOf(SOURCES),
  );
  assert.equal(answer.groups.length, 1);
  assert.deepEqual(answer.groups[0].sources, ['https://example.org/straw', 'https://example.org/retrofit']);
});

test('an answer out of scope carries no research, whatever the model put in it', () => {
  const answer = readAnswer(
    { in_scope: false, reply: 'Only regenerative design.', groups: [{ title: 'X', reasoning: '', sources: ['S1'] }] },
    catalogueOf(SOURCES),
  );
  assert.equal(answer.inScope, false);
  assert.deepEqual(answer.groups, []);
});

test('the request: the current model, structured output, the catalogue cached, no prefill', () => {
  const body = requestBody('straw?', catalogueOf(SOURCES));
  assert.equal(body.model, MODEL);
  assert.equal(body.fallbacks, 'default');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.ok(body.output_config.effort, 'effort is set explicitly');
  assert.equal(body.thinking, undefined, 'no thinking budget is sent');
  assert.deepEqual(body.system[1].cache_control, { type: 'ephemeral' });
  assert.equal(body.messages.at(-1).role, 'user');
  assert.match(body.system[0].text, /regenerative design/);
});

test('a model answer is read from its text, past the thinking, with the right headers sent', async () => {
  let sent;
  const answer = await consult('Straw and carbon?', SOURCES, {
    key: 'test-key',
    fetchImpl: async (url, init) => {
      sent = init;
      return reply(
        message({
          in_scope: true,
          reply: 'Read as low-carbon walls.',
          groups: [{ title: 'Straw walls', reasoning: 'Straw stores carbon.', sources: ['S1'] }],
        }),
      );
    },
  });
  assert.equal(sent.headers['x-api-key'], 'test-key');
  assert.equal(sent.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.equal(answer.by, 'model');
  assert.deepEqual(answer.groups[0].sources, ['https://example.org/straw']);
});

test('a refusal is answered as out of scope, not as an error', async () => {
  const answer = await consult('Something else entirely', SOURCES, {
    key: 'k',
    fetchImpl: async () => reply(message({}, { stop_reason: 'refusal', content: [] })),
  });
  assert.equal(answer.inScope, false);
  assert.deepEqual(answer.groups, []);
});

test('if the API refuses the fallback option, the question is asked again without it', async () => {
  const calls = [];
  const answer = await consult('Straw?', SOURCES, {
    key: 'k',
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body));
      if (calls.length === 1) return reply({ error: { message: 'fallbacks: not supported' } }, 400);
      return reply(message({ in_scope: true, reply: 'Yes.', groups: [] }));
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].fallbacks, undefined);
  assert.equal(answer.reply, 'Yes.');
});

test('a busy or broken API becomes a message a visitor can act on', async () => {
  await assert.rejects(
    consult('Straw?', SOURCES, { key: 'k', fetchImpl: async () => reply({}, 429) }),
    (error) => error instanceof LibrarianError && error.status === 503,
  );
  await assert.rejects(
    consult('Straw?', SOURCES, {
      key: 'k',
      fetchImpl: async () => reply({ ...message({}), content: [{ type: 'text', text: 'not json' }] }),
    }),
    (error) => error instanceof LibrarianError && error.status === 502,
  );
});

test('without a key the librarian answers by keyword, grouped by the tags it found', async () => {
  const answer = await librarian({ question: 'straw and carbon in retrofit' }, SOURCES, { key: '' });
  assert.equal(answer.by, 'keywords');
  const titles = answer.groups.map((group) => group.title);
  assert.ok(titles.includes('Straw'));
  assert.ok(titles.includes('Carbon'));
  assert.ok(!answer.groups.flatMap((g) => g.sources).includes('https://example.org/soil'));
});

test('nothing found by keyword is said plainly', () => {
  const answer = consultOffline('quantum chromodynamics', SOURCES);
  assert.deepEqual(answer.groups, []);
  assert.match(answer.reply, /Nothing in the library/);
});

test('one visitor is held to a handful of questions a minute', () => {
  const allowed = rateLimiter({ limit: 2, windowMs: 60_000 });
  assert.equal(allowed('a'), true);
  assert.equal(allowed('a'), true);
  assert.equal(allowed('a'), false);
  assert.equal(allowed('b'), true);
});

test('the web function answers from the published snapshot', async () => {
  // Empty rather than unset, so a key in a local .env is not read in behind it
  // and the test never spends anything.
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = '';
  try {
    const { default: handler } = await import('../api/librarian.js');
    const result = await new Promise((resolve) => {
      const res = {
        writeHead(status) {
          this.status = status;
        },
        end(text) {
          resolve({ status: this.status, body: JSON.parse(text) });
        },
      };
      handler(
        { method: 'POST', headers: {}, socket: {}, body: { question: 'embodied carbon in buildings' } },
        res,
      );
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.by, 'keywords');
    assert.ok(result.body.groups.length > 0, 'the snapshot holds research on carbon');
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  }
});
