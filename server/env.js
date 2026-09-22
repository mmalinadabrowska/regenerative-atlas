/**
 * Read a .env file, if there is one.
 *
 * Node can do this itself with --env-file, but only on recent versions and only
 * if you remember the flag — and the first thing anyone connecting this to a
 * Supabase project has to do is put two secrets somewhere. Somewhere is a file
 * called .env next to package.json, and this is what reads it.
 *
 * Deliberately small: KEY=value, one per line, # for a comment, quotes
 * optional. Anything already in the environment wins, so a value set on the
 * machine — which is how a server should be configured — is never overwritten
 * by a file left in the working copy.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(path = resolve(ROOT, '.env')) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return 0; // No file is the ordinary case, not an error.
  }

  let read = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at < 1) continue;

    const key = trimmed.slice(0, at).trim().replace(/^export\s+/, '');
    let value = trimmed.slice(at + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
      read += 1;
    }
  }
  return read;
}
