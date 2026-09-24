/**
 * Thin wrapper over the Atlas API — every page talks to the server through here.
 *
 * With no server there is still a library: `npm run build-static` bakes the read
 * endpoints into data/snapshot.json, and a single-file build inlines the same
 * object as window.__ATLAS_SNAPSHOT__. Reads fall back to it, so public/ can be
 * dropped on any static host and the map still works. Writing cannot fall back
 * to anything, and says so.
 */

let snapshot = typeof window !== 'undefined' ? window.__ATLAS_SNAPSHOT__ ?? null : null;
let snapshotRequest = null;

async function baked() {
  if (snapshot) return snapshot;
  if (!snapshotRequest) {
    snapshotRequest = fetch('/data/snapshot.json')
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  snapshot = await snapshotRequest;
  return snapshot;
}

async function request(path, options) {
  const response = await fetch(path, {
    headers: { accept: 'application/json', ...(options?.body ? { 'content-type': 'application/json' } : {}) },
    ...options,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? `The Atlas could not answer (${response.status}).`);
  }
  return body;
}

/** Try the server; fall back to the baked library if there isn't one. */
async function read(path, fromSnapshot) {
  if (snapshot) return fromSnapshot(snapshot);
  try {
    return await request(path);
  } catch (error) {
    const baked_ = await baked();
    if (!baked_) throw error;
    return fromSnapshot(baked_);
  }
}

const wanted = (params) => ({
  tags: String(params.tag ?? '').split(',').filter(Boolean),
  query: String(params.q ?? '').trim().toLowerCase(),
});

const matches = (source, { tags, query }) => {
  // Places are filed on the record rather than among the tags the map draws
  // from, and they are filtered on exactly like any other tag — so the
  // snapshot has to look in both, or asking for the UK finds nothing.
  const slugs = [...(source.tags ?? []), ...(source.places ?? [])].map((t) => t.slug ?? t);
  if (!tags.every((slug) => slugs.includes(slug))) return false;
  if (!query) return true;
  return [source.title ?? source.label, source.authors, source.publisher, source.summary]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query);
};

/**
 * Narrow the baked graph the way the server would. The server recomputes
 * clusters and kinship for the surviving set; this keeps the ones it already
 * has, which is close enough to explore with and honest about being a snapshot.
 */
function narrowGraph(graph, params) {
  const filters = wanted(params);
  if (filters.tags.length === 0 && !filters.query) return graph;

  const sources = graph.nodes.filter((node) => node.type === 'source' && matches(node, filters));
  const keep = new Set(sources.map((n) => n.id));
  for (const source of sources) for (const slug of source.tags ?? []) keep.add(`t:${slug}`);

  const nodes = graph.nodes.filter((node) => keep.has(node.id));
  const links = graph.links.filter((link) => keep.has(link.source) && keep.has(link.target));
  return {
    ...graph,
    nodes,
    links,
    stats: {
      ...graph.stats,
      sources: sources.length,
      tags: nodes.filter((n) => n.type === 'tag').length,
      links: links.length,
      kin: links.filter((l) => l.kind === 'kin').length,
    },
  };
}

const unavailable = () => {
  throw new Error('This is a static snapshot of the library — adding is switched off here.');
};

/**
 * True once a read has been answered by the baked library rather than by a
 * server. Anything that offers an endpoint the snapshot has no answer for —
 * the whole-library exports, above all — asks this first, so a static copy
 * does not advertise a link that would only ever 404.
 */
export const usingSnapshot = () => snapshot !== null;

export const api = {
  stats: () => read('/api/stats', (baked_) => baked_.stats),
  tags: () => read('/api/tags', (baked_) => baked_.tags),
  vocabulary: () => read('/api/vocabulary', (baked_) => baked_.vocabulary),
  sources: (params = {}) =>
    read(`/api/sources?${new URLSearchParams(params)}`, (baked_) => {
      const filters = wanted(params);
      const sources = baked_.sources.sources.filter((source) => matches(source, filters));
      return { total: baked_.sources.total, count: sources.length, sources };
    }),
  graph: (params = {}) =>
    read(`/api/graph?${new URLSearchParams(params)}`, (baked_) => narrowGraph(baked_.graph, params)),
  describe: (url) =>
    snapshot ? unavailable() : request('/api/describe', { method: 'POST', body: JSON.stringify({ url }) }),
  submit: (source) =>
    snapshot ? unavailable() : request('/api/sources', { method: 'POST', body: JSON.stringify(source) }),
};

/** Escape anything that came from a contributor before it touches innerHTML. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "Authors · Publisher · 2014" without stray separators when fields are blank. */
export function citationLine(source) {
  return [source.authors, source.publisher, source.year].filter(Boolean).join(' · ');
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Keeps the source count in the top bar honest without every page repeating it. */
export async function fillCount(selector = '[data-count]') {
  const node = document.querySelector(selector);
  if (!node) return;
  try {
    // Tags here means what the map draws — the same number the legend gives —
    // so the two never disagree. The places are counted in `stats` as well,
    // but they are read in their own filter rather than in this line, which
    // has to survive a phone.
    const { sources, tags } = await api.stats();
    node.textContent = `${sources} sources · ${tags} tags`;
  } catch {
    node.textContent = '';
  }
}
