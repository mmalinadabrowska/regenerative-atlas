/**
 * Storage for the Atlas.
 *
 * SQLite via Node's built-in `node:sqlite`, so the whole platform runs with no
 * install step: clone, `node server/index.js`, done. The database file lives in
 * data/atlas.db and is safe to delete — `npm run reset` rebuilds it from seed.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTags } from './vocabulary.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DB_PATH = process.env.ATLAS_DB ?? resolve(ROOT, 'data', 'atlas.db');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id          INTEGER PRIMARY KEY,
  url         TEXT NOT NULL,
  url_key     TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  authors     TEXT NOT NULL DEFAULT '',
  publisher   TEXT NOT NULL DEFAULT '',
  year        INTEGER,
  summary     TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  contributor TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'published',
  origin      TEXT NOT NULL DEFAULT 'submitted',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id     INTEGER PRIMARY KEY,
  slug   TEXT NOT NULL UNIQUE,
  label  TEXT NOT NULL,
  facet  TEXT NOT NULL DEFAULT 'open',
  note   TEXT,
  core   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS source_tags (
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (source_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_source_tags_tag ON source_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);

CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(
  title, authors, publisher, summary, note, tags,
  tokenize='unicode61'
);
`;

/**
 * Normalise a URL for de-duplication: same paper submitted twice, once with
 * tracking params and once without, should be one node on the map.
 */
export function urlKey(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl).trim());
  } catch {
    return String(rawUrl).trim().toLowerCase();
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const params = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (/^(utm_|fbclid|gclid|mc_cid|mc_eid|ref|source)/i.test(k)) continue;
    params.append(k, v);
  }
  params.sort();
  const query = params.toString();
  let path = u.pathname.replace(/\/+$/, '');
  if (path === '') path = '/';
  return `${host}${path}${query ? `?${query}` : ''}`;
}

export function openDatabase(path = DEFAULT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return new Atlas(db);
}

export class Atlas {
  constructor(db) {
    this.db = db;
  }

  close() {
    this.db.close();
  }

  // — tags ————————————————————————————————————————————————

  /** Insert the tag if new, refresh its curated metadata if it already exists. */
  tagId(tag) {
    this.db
      .prepare(
        `INSERT INTO tags (slug, label, facet, note, core) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET label = excluded.label, facet = excluded.facet,
           note = COALESCE(excluded.note, tags.note), core = excluded.core`,
      )
      .run(tag.slug, tag.label, tag.facet, tag.note ?? null, tag.core ? 1 : 0);
    return this.db.prepare('SELECT id FROM tags WHERE slug = ?').get(tag.slug).id;
  }

  /** Every tag that is actually in use, with how many sources carry it. */
  tagsWithCounts() {
    return this.db
      .prepare(
        // Count s.id, not st.source_id: the status test lives on a LEFT JOIN,
        // so an unpublished source still leaves its source_tags row behind.
        `SELECT t.slug, t.label, t.facet, t.note, t.core, COUNT(s.id) AS count
         FROM tags t
         LEFT JOIN source_tags st ON st.tag_id = t.id
         LEFT JOIN sources s ON s.id = st.source_id AND s.status = 'published'
         GROUP BY t.id
         HAVING count > 0
         ORDER BY count DESC, t.label ASC`,
      )
      .all()
      .map((r) => ({ ...r, core: Boolean(r.core) }));
  }

  /** Tag pairs that appear together, the raw material for clustering. */
  tagCooccurrence(minShared = 1) {
    return this.db
      .prepare(
        `SELECT a.slug AS a, b.slug AS b, COUNT(*) AS weight
         FROM source_tags sa
         JOIN source_tags sb ON sa.source_id = sb.source_id AND sa.tag_id < sb.tag_id
         JOIN sources s ON s.id = sa.source_id AND s.status = 'published'
         JOIN tags a ON a.id = sa.tag_id
         JOIN tags b ON b.id = sb.tag_id
         GROUP BY a.slug, b.slug
         HAVING weight >= ?
         ORDER BY weight DESC`,
      )
      .all(minShared);
  }

  // — sources ——————————————————————————————————————————————

  /**
   * Add a source. Returns { source, created } — re-submitting a known URL merges
   * the new tags in rather than making a second node, because two people finding
   * the same paper is a signal, not a collision.
   */
  addSource(input) {
    const key = urlKey(input.url);
    const existing = this.db.prepare('SELECT * FROM sources WHERE url_key = ?').get(key);
    const tags = resolveTags(input.tags);

    if (existing) {
      this.attachTags(existing.id, tags);
      this.reindex(existing.id);
      return { source: this.getSource(existing.id), created: false };
    }

    const info = this.db
      .prepare(
        `INSERT INTO sources (url, url_key, title, authors, publisher, year, summary, note, contributor, origin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        String(input.url).trim(),
        key,
        input.title,
        input.authors ?? '',
        input.publisher ?? '',
        input.year ?? null,
        input.summary ?? '',
        input.note ?? '',
        input.contributor ?? '',
        input.origin ?? 'submitted',
      );

    const id = Number(info.lastInsertRowid);
    this.attachTags(id, tags);
    this.reindex(id);
    return { source: this.getSource(id), created: true };
  }

  attachTags(sourceId, tags) {
    const link = this.db.prepare(
      'INSERT OR IGNORE INTO source_tags (source_id, tag_id) VALUES (?, ?)',
    );
    for (const tag of tags) link.run(sourceId, this.tagId(tag));
  }

  /** Keep the full-text index in step with a row. */
  reindex(sourceId) {
    const s = this.getSource(sourceId);
    if (!s) return;
    this.db.prepare('DELETE FROM sources_fts WHERE rowid = ?').run(sourceId);
    this.db
      .prepare(
        `INSERT INTO sources_fts (rowid, title, authors, publisher, summary, note, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(sourceId, s.title, s.authors, s.publisher, s.summary, s.note, s.tags.map((t) => t.label).join(' '));
  }

  rebuildIndex() {
    this.db.prepare('DELETE FROM sources_fts').run();
    for (const { id } of this.db.prepare('SELECT id FROM sources').all()) this.reindex(id);
  }

  getSource(id) {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
    return row ? this.hydrate(row) : null;
  }

  hydrate(row) {
    const tags = this.db
      .prepare(
        `SELECT t.slug, t.label, t.facet FROM tags t
         JOIN source_tags st ON st.tag_id = t.id
         WHERE st.source_id = ?
         ORDER BY t.facet, t.label`,
      )
      .all(row.id);
    return { ...row, tags };
  }

  /**
   * List published sources, optionally narrowed by tags (AND) and free text.
   * Text search uses FTS5 when the query is well-formed and falls back to LIKE
   * for anything the tokeniser would choke on.
   */
  listSources({ tags = [], query = '', limit = 500, offset = 0 } = {}) {
    const wheres = ["s.status = 'published'"];
    const params = [];

    for (const slug of tags) {
      wheres.push(
        `EXISTS (SELECT 1 FROM source_tags st JOIN tags t ON t.id = st.tag_id
                 WHERE st.source_id = s.id AND t.slug = ?)`,
      );
      params.push(slug);
    }

    const q = String(query ?? '').trim();
    if (q) {
      const ids = this.searchIds(q);
      if (ids.length === 0) return [];
      wheres.push(`s.id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }

    const rows = this.db
      .prepare(
        `SELECT s.* FROM sources s WHERE ${wheres.join(' AND ')}
         ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);
    return rows.map((r) => this.hydrate(r));
  }

  searchIds(query) {
    const terms = String(query)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 1);
    if (terms.length === 0) return [];
    try {
      const match = terms.map((t) => `"${t}"*`).join(' OR ');
      return this.db
        .prepare('SELECT rowid FROM sources_fts WHERE sources_fts MATCH ? ORDER BY rank')
        .all(match)
        .map((r) => r.rowid);
    } catch {
      const like = `%${query.trim()}%`;
      return this.db
        .prepare(
          `SELECT id AS rowid FROM sources
           WHERE title LIKE ? OR authors LIKE ? OR publisher LIKE ? OR summary LIKE ?`,
        )
        .all(like, like, like, like)
        .map((r) => r.rowid);
    }
  }

  count() {
    return this.db
      .prepare("SELECT COUNT(*) AS n FROM sources WHERE status = 'published'")
      .get().n;
  }

  /** Source id -> tag slugs, for the graph builder. */
  tagMap() {
    const map = new Map();
    const rows = this.db
      .prepare(
        `SELECT st.source_id AS id, t.slug FROM source_tags st
         JOIN tags t ON t.id = st.tag_id
         JOIN sources s ON s.id = st.source_id AND s.status = 'published'`,
      )
      .all();
    for (const { id, slug } of rows) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(slug);
    }
    return map;
  }

  setStatus(id, status) {
    this.db.prepare("UPDATE sources SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    return this.getSource(id);
  }
}
