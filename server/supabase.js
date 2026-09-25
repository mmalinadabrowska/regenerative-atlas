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

import { randomBytes } from 'node:crypto';

import { urlKey } from './keys.js';
import { resolveTags } from './vocabulary.js';

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

// --- the submission queue ---------------------------------------------------
//
// The Atlas is curated and its form is open to anyone, so an entry from the
// site is not added — it is queued. These four calls are the whole of that:
// put one in, read one back, count what is waiting, and decide. Nothing here
// touches SQLite: the queue lives in the project, because the machine that
// receives a submission on the web is not the machine the map is drawn on, and
// may not exist a second later.

/** A key for one submission: unguessable, and the only way back to it. */
export function reviewToken() {
  return randomBytes(24).toString('base64url');
}

const QUEUE_FIELDS =
  'id,token,status,url,url_key,title,authors,publisher,year,summary,note,contributor,tags,source_id,created_at,reviewed_at';

/**
 * Put a submission in the queue.
 *
 * A link already waiting is not queued twice — the second person to find the
 * same paper is told it is already with the curator rather than made to feel
 * ignored, and the curator is not asked the same question twice.
 */
export async function queue(submission) {
  const key = urlKey(submission.url);

  const waiting = await rest(
    `submissions?url_key=eq.${encodeURIComponent(key)}&status=eq.pending&select=${QUEUE_FIELDS}&limit=1`,
  );
  if (waiting.length > 0) return { entry: waiting[0], queued: false, reason: 'already waiting' };

  const [entry] = await rest(`submissions?select=${QUEUE_FIELDS}`, {
    method: 'POST',
    prefer: 'return=representation',
    body: [
      {
        token: reviewToken(),
        url: submission.url,
        url_key: key,
        title: submission.title,
        authors: submission.authors ?? '',
        publisher: submission.publisher ?? '',
        year: submission.year ?? null,
        summary: submission.summary ?? '',
        note: submission.note ?? '',
        contributor: submission.contributor ?? '',
        tags: submission.tags ?? [],
      },
    ],
  });
  return { entry, queued: true };
}

/** Whether this link is already in the published library. */
export async function published(url) {
  const rows = await rest(
    `sources?url_key=eq.${encodeURIComponent(urlKey(url))}&select=id,title&limit=1`,
  );
  return rows[0] ?? null;
}

/** One submission, by the token in the email. Null if the token is not a key to anything. */
export async function submission(token) {
  if (!token) return null;
  const rows = await rest(
    `submissions?token=eq.${encodeURIComponent(token)}&select=${QUEUE_FIELDS}&limit=1`,
  );
  return rows[0] ?? null;
}

/** How many are waiting — for the line at the top of a review page. */
export async function waiting() {
  const rows = await rest('submissions?status=eq.pending&select=id');
  return rows.length;
}

/**
 * Accept or decline one.
 *
 * Accepting writes the record across into `sources`, where the map can see it,
 * and only then marks the submission — so a failure halfway leaves the entry
 * still pending and reviewable rather than accepted and lost. Deciding twice is
 * not an error: the second answer is told what the first one was.
 */
export async function decide(token, decision) {
  if (decision !== 'accept' && decision !== 'decline') {
    throw new SupabaseError(0, `A submission is accepted or declined, not "${decision}".`);
  }

  const entry = await submission(token);
  if (!entry) return { ok: false, reason: 'no such submission' };
  if (entry.status !== 'pending') {
    return { ok: false, reason: `already ${entry.status}`, entry };
  }

  let sourceId = null;
  if (decision === 'accept') {
    // Resolved rather than passed through: the vocabulary knows a slug's label
    // and which facet it belongs to, and a record that reaches the project
    // without them is a record the map cannot file.
    const tags = resolveTags(entry.tags ?? []);
    const written = await push({ ...entry, tags, status: 'published', origin: 'submitted' });
    sourceId = written.id;
  }

  const [updated] = await rest(`submissions?token=eq.${encodeURIComponent(token)}&select=${QUEUE_FIELDS}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      status: decision === 'accept' ? 'accepted' : 'declined',
      reviewed_at: new Date().toISOString(),
      source_id: sourceId,
    },
  });

  return { ok: true, decision, entry: updated ?? entry, sourceId };
}
