/**
 * The Atlas' library, kept in a Supabase project.
 *
 * Supabase is the durable copy: the place the research actually lives, where it
 * survives this machine and can be read by anything else you point at it. The
 * server still runs on the local SQLite database — every read the map makes is
 * synchronous, and a map that waits on the network for each of them is not a
 * map you can drag — so the two are kept in step rather than swapped:
 *
 *   on boot   pull everything down into SQLite, which is then the working copy
 *   on add    write through to Supabase, and say so if that write fails
 *
 * There is no client library here, only `fetch` against PostgREST, which is the
 * API Supabase already exposes. That keeps the install story the rest of this
 * project has — clone it and run it — and it means this file can be read in one
 * sitting by somebody who has never used Supabase.
 *
 * With no credentials in the environment none of this runs, and the Atlas is
 * exactly what it was: a SQLite file you can delete.
 */

import { urlKey } from './db.js';

const trimSlash = (value) => String(value ?? '').replace(/\/+$/, '');

/** Read afresh each time: tests and scripts set these after import. */
function credentials() {
  const url = trimSlash(process.env.SUPABASE_URL);
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    '';
  return { url, key };
}

export function configured() {
  const { url, key } = credentials();
  return Boolean(url && key);
}

/** The project's own name, for saying which one we are talking to. */
export function projectRef() {
  const { url } = credentials();
  return url.replace(/^https?:\/\//, '').replace(/\.supabase\.(co|in)$/, '');
}

class SupabaseError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = credentials();
  if (!url || !key) throw new SupabaseError(0, 'No Supabase credentials in the environment.');

  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const said = parsed?.message ?? parsed?.hint ?? response.statusText;
    throw new SupabaseError(response.status, `Supabase said: ${said}`, parsed);
  }
  return parsed;
}

/** Does the project have the tables this expects? Answered before anything else. */
export async function check() {
  await rest('sources?select=id&limit=1');
  return true;
}

const COLUMNS =
  'url,title,authors,publisher,year,summary,note,contributor,status,origin,created_at,' +
  'source_tags(tags(slug,label,facet,note,core))';

/**
 * Everything published, oldest first, as the shape `addSource` takes. Paged,
 * because PostgREST caps a response and a library is meant to outgrow one page.
 */
export async function fetchLibrary({ pageSize = 500 } = {}) {
  const sources = [];
  for (let from = 0; ; from += pageSize) {
    const page = await rest(
      `sources?select=${COLUMNS}&status=eq.published&order=created_at.asc` +
        `&offset=${from}&limit=${pageSize}`,
    );
    for (const row of page ?? []) {
      sources.push({
        url: row.url,
        title: row.title,
        authors: row.authors ?? '',
        publisher: row.publisher ?? '',
        year: row.year ?? null,
        summary: row.summary ?? '',
        note: row.note ?? '',
        contributor: row.contributor ?? '',
        created_at: row.created_at,
        tags: (row.source_tags ?? []).map((link) => link.tags?.slug).filter(Boolean),
      });
    }
    if (!page || page.length < pageSize) break;
  }
  return sources;
}

/**
 * Bring the library down into a local Atlas. Adding is idempotent — a source is
 * one row per URL and the tags are merged — so this can be run against a
 * database that already holds some of it.
 */
export async function pull(atlas, options = {}) {
  const sources = await fetchLibrary(options);
  let added = 0;
  for (const source of sources) {
    const { created } = atlas.addSource(source);
    if (created) added += 1;
  }
  return { fetched: sources.length, added };
}

/**
 * Write one source up, tags and all. Three upserts rather than one call: a
 * source, the tags it claims, and the ties between them — the same three tables
 * the local database keeps, because a record that means something different in
 * the two places is worse than no copy at all.
 */
export async function push(source) {
  const [row] = await rest('sources?on_conflict=url_key&select=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [
      {
        url: source.url,
        url_key: urlKey(source.url),
        title: source.title,
        authors: source.authors ?? '',
        publisher: source.publisher ?? '',
        year: source.year ?? null,
        summary: source.summary ?? '',
        note: source.note ?? '',
        contributor: source.contributor ?? '',
        status: source.status ?? 'published',
        origin: source.origin ?? 'submitted',
      },
    ],
  });

  const tags = (source.tags ?? []).map((tag) =>
    typeof tag === 'string' ? { slug: tag, label: tag, facet: 'open', core: false } : tag,
  );
  if (tags.length === 0) return { id: row.id, tags: 0 };

  const saved = await rest('tags?on_conflict=slug&select=id,slug', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: tags.map((tag) => ({
      slug: tag.slug,
      label: tag.label ?? tag.slug,
      facet: tag.facet ?? 'open',
      note: tag.note ?? null,
      core: Boolean(tag.core),
    })),
  });

  await rest('source_tags?on_conflict=source_id,tag_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: saved.map((tag) => ({ source_id: row.id, tag_id: tag.id })),
  });

  return { id: row.id, tags: saved.length };
}

/** The whole local library, pushed. For seeding a project, or after a spell offline. */
export async function pushAll(atlas, { onProgress } = {}) {
  const sources = atlas.listSources({ limit: 10000 });
  let sent = 0;
  for (const source of sources) {
    await push({ ...source, tags: source.tags });
    sent += 1;
    onProgress?.(sent, sources.length, source);
  }
  return sent;
}
