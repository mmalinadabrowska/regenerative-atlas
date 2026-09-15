/**
 * The Atlas' JSON API.
 *
 * Handlers are plain functions over an Atlas instance so they can be tested
 * without a socket. Everything a contributor sends is treated as untrusted:
 * clamped, trimmed, and run through the vocabulary before it reaches the map.
 */

import { buildGraph } from './graph.js';
import { describeUrl } from './metadata.js';
import { CORE_TAGS, FACETS, FACET_ORDER, aliasIndex, resolveTags } from './vocabulary.js';

const LIMITS = {
  title: 300,
  authors: 300,
  publisher: 200,
  summary: 1200,
  note: 600,
  contributor: 120,
  url: 2000,
  tags: 12,
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** A source's own words are worth keeping line breaks for. */
const paragraph = (value, max) =>
  String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);

function parseYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const year = Number(String(value).match(/\d{4}/)?.[0]);
  const thisYear = new Date().getFullYear();
  if (!Number.isFinite(year) || year < 1400 || year > thisYear + 2) return null;
  return year;
}

export function validateSubmission(body) {
  const url = text(body?.url, LIMITS.url);
  if (!url) throw new ApiError(400, 'A link is required — that is the one thing the Atlas needs.');

  const tags = resolveTags(Array.isArray(body?.tags) ? body.tags : String(body?.tags ?? '').split(','))
    .slice(0, LIMITS.tags);
  if (tags.length === 0) {
    throw new ApiError(400, 'Add at least one tag, so the source has somewhere to sit on the map.');
  }

  const title = text(body?.title, LIMITS.title);
  if (!title) throw new ApiError(400, 'A title is required.');

  return {
    url,
    title,
    authors: text(body?.authors, LIMITS.authors),
    publisher: text(body?.publisher, LIMITS.publisher),
    year: parseYear(body?.year),
    summary: paragraph(body?.summary, LIMITS.summary),
    note: paragraph(body?.note, LIMITS.note),
    contributor: text(body?.contributor, LIMITS.contributor),
    tags: tags.map((t) => t.slug),
  };
}

export const handlers = {
  vocabulary() {
    return {
      facets: FACET_ORDER.map((key) => ({ key, ...FACETS[key] })),
      tags: CORE_TAGS,
      aliases: aliasIndex(),
    };
  },

  tags(atlas) {
    const tags = atlas.tagsWithCounts();
    const byFacet = FACET_ORDER.map((key) => ({
      key,
      ...FACETS[key],
      tags: tags.filter((t) => t.facet === key),
    })).filter((group) => group.tags.length > 0);
    return { total: tags.length, tags, facets: byFacet };
  },

  sources(atlas, params) {
    const tags = params.getAll('tag').flatMap((t) => t.split(',')).filter(Boolean);
    const query = params.get('q') ?? '';
    const limit = Math.min(Number(params.get('limit')) || 200, 1000);
    const offset = Math.max(Number(params.get('offset')) || 0, 0);
    const sources = atlas.listSources({ tags, query, limit, offset });
    return { total: atlas.count(), count: sources.length, sources };
  },

  graph(atlas, params) {
    const tags = params.getAll('tag').flatMap((t) => t.split(',')).filter(Boolean);
    return buildGraph(atlas, {
      filterTags: tags,
      query: params.get('q') ?? '',
      includeTagNodes: params.get('tags') !== 'off',
      minKinship: Number(params.get('kinship')) || undefined,
    });
  },

  stats(atlas) {
    const tags = atlas.tagsWithCounts();
    return {
      sources: atlas.count(),
      tags: tags.length,
      contributors: new Set(
        atlas.listSources({ limit: 5000 }).map((s) => s.contributor).filter(Boolean),
      ).size,
      newest: atlas.listSources({ limit: 5 }).map((s) => ({
        id: s.id,
        title: s.title,
        url: s.url,
        year: s.year,
        tags: s.tags.map((t) => t.slug),
      })),
    };
  },

  async describe(atlas, body) {
    const url = text(body?.url, LIMITS.url);
    if (!url) throw new ApiError(400, 'Paste a link first.');
    const described = await describeUrl(url);
    const existing = atlas.listSources({ limit: 5000 }).find((s) => s.url === url);
    return { ...described, alreadyInAtlas: existing ? { id: existing.id, title: existing.title } : null };
  },

  submit(atlas, body) {
    const submission = validateSubmission(body);
    const { source, created } = atlas.addSource(submission);
    return { created, source };
  },
};

/** The whole library as one JSON file — the Atlas should be easy to leave. */
export function exportJson(atlas) {
  return {
    name: 'Regenerative Atlas',
    exportedAt: new Date().toISOString(),
    license: 'Bibliographic records are shared under CC0; linked works remain with their authors.',
    sources: atlas.listSources({ limit: 10000 }).map((s) => ({
      title: s.title,
      url: s.url,
      authors: s.authors || undefined,
      publisher: s.publisher || undefined,
      year: s.year ?? undefined,
      summary: s.summary || undefined,
      note: s.note || undefined,
      contributor: s.contributor || undefined,
      tags: s.tags.map((t) => t.slug),
      addedAt: s.created_at,
    })),
  };
}

// Strip the characters that would break a .bib file, then close the gap they
// leave behind so the field doesn't read with a hole in it.
const bibEscape = (value) =>
  String(value ?? '')
    .replace(/[{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** BibTeX, because a bibliography that can't be cited is a reading list. */
export function exportBibtex(atlas) {
  const used = new Set();
  return atlas
    .listSources({ limit: 10000 })
    .map((s) => {
      const surname = (s.authors.split(',')[0] ?? '').trim().split(/\s+/).pop() ?? '';
      const word = s.title.split(/\s+/).find((w) => w.length > 3) ?? 'source';
      let key = [surname, s.year, word]
        .filter(Boolean)
        .join('')
        .replace(/[^A-Za-z0-9]/g, '') || `atlas${s.id}`;
      while (used.has(key)) key += 'a';
      used.add(key);

      const kinds = s.tags.map((t) => t.slug);
      const type = kinds.includes('book') ? 'book' : kinds.includes('paper') ? 'article' : 'misc';

      const fields = [
        ['title', bibEscape(s.title)],
        ['author', bibEscape(s.authors.replace(/,\s*/g, ' and '))],
        [type === 'article' ? 'journal' : 'howpublished', bibEscape(s.publisher)],
        ['year', s.year ?? ''],
        ['url', s.url],
        ['keywords', kinds.join(', ')],
      ].filter(([, value]) => String(value).length > 0);

      return `@${type}{${key},\n${fields
        .map(([name, value]) => `  ${name} = {${value}}`)
        .join(',\n')}\n}`;
    })
    .join('\n\n');
}
