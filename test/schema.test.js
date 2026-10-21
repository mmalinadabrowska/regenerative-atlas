import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  .replace(/--.*$/gm, '')
  .toLowerCase();

const tables = [...SCHEMA.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);

/** The tables a grant statement names, for the role it is made to. */
const granted = (privileges, role) =>
  [...SCHEMA.matchAll(/grant ([\w ,]+?) on ([\w ,]+?) to ([\w ,]+?);/g)]
    .filter(([, what, , to]) => what.includes(privileges) && to.split(',').map((r) => r.trim()).includes(role))
    .flatMap(([, , on]) => on.split(',').map((t) => t.trim()));

// From 30 October 2026 a new Supabase table answers "permission denied" until
// it is granted, so a table without grants here would break a rebuilt project.
test('every table in the schema is granted to the service role, which writes it', () => {
  assert.ok(tables.length >= 4);
  const writable = granted('insert', 'service_role');
  for (const table of tables) assert.ok(writable.includes(table), `${table} has no grant to service_role`);
});

test('the browser key can read the library and nothing else', () => {
  const readable = granted('select', 'anon');
  assert.deepEqual(readable.sort(), ['source_tags', 'sources', 'tags']);
  assert.deepEqual(granted('insert', 'anon'), []);
  assert.ok(!readable.includes('submissions'), 'the queue is never public');
});
