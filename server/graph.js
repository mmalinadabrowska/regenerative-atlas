/**
 * Builds the constellation.
 *
 * The map has two kinds of node — sources and tags — and two kinds of line:
 *
 *   tagged : a source to each tag it carries. These are the structural lines,
 *            the ones that pull a source towards its territory.
 *   kin    : source to source, drawn when two pieces of research share enough
 *            uncommon vocabulary to be worth reading together. This is the
 *            "connecting lines between related links" of the brief, and it is
 *            deliberately sparse — a graph that links everything says nothing.
 *
 * Clustering happens on the *tags* first, by label propagation over their
 * co-occurrence graph. Tag communities are more stable than source communities
 * and they name themselves, which is what you want on a map you have to read.
 * A source then joins the community its rarest tags vote for.
 *
 * Everything here is deterministic: the same library produces the same map.
 */

/** Small, fast, seeded PRNG so ordering never changes between runs. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, rand) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Inverse document frequency per tag. A source tagged "materials" tells you
 * little — half the library is materials. A source tagged "mycelium" tells you
 * a lot. Kinship weighs the second far more heavily than the first.
 */
export function idfWeights(tagMap, total) {
  const counts = new Map();
  for (const tags of tagMap.values()) {
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const idf = new Map();
  for (const [tag, n] of counts) idf.set(tag, Math.log((total + 1) / (n + 0.5)));
  return idf;
}

/**
 * Cosine similarity over idf-weighted tag vectors — 0 is unrelated, 1 is the
 * same subject. Cosine rather than Jaccard on purpose: a thoroughly tagged
 * source shouldn't be penalised for the tags it does *not* share, and two
 * pieces meeting on one uncommon tag should still find each other.
 */
export function kinship(tagsA, tagsB, idf) {
  const a = new Set(tagsA);
  const b = new Set(tagsB);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const t of a) {
    const w = idf.get(t) ?? 1;
    normA += w * w;
    if (b.has(t)) dot += w * w;
  }
  for (const t of b) {
    const w = idf.get(t) ?? 1;
    normB += w * w;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

/**
 * Label propagation over a weighted adjacency map.
 * Ties break on the lexicographically smallest label, which keeps runs stable.
 */
export function labelPropagate(nodes, adjacency, { iterations = 24, seed = 7 } = {}) {
  const labels = new Map(nodes.map((n) => [n, n]));
  const rand = mulberry32(seed);

  for (let i = 0; i < iterations; i++) {
    let moved = 0;
    for (const node of shuffled(nodes, rand)) {
      const neighbours = adjacency.get(node);
      if (!neighbours || neighbours.size === 0) continue;

      const votes = new Map();
      for (const [other, weight] of neighbours) {
        const label = labels.get(other);
        votes.set(label, (votes.get(label) ?? 0) + weight);
      }

      let best = labels.get(node);
      let bestScore = votes.get(best) ?? 0;
      for (const [label, score] of votes) {
        if (score > bestScore || (score === bestScore && label < best)) {
          best = label;
          bestScore = score;
        }
      }
      if (best !== labels.get(node)) {
        labels.set(node, best);
        moved++;
      }
    }
    if (moved === 0) break;
  }
  return labels;
}

/** Cosine-normalised co-occurrence, so common tags don't dominate every pair. */
function tagAdjacency(cooccurrence, tagCounts) {
  const adjacency = new Map();
  const add = (a, b, w) => {
    if (!adjacency.has(a)) adjacency.set(a, new Map());
    adjacency.get(a).set(b, w);
  };
  for (const { a, b, weight } of cooccurrence) {
    const na = tagCounts.get(a) ?? 1;
    const nb = tagCounts.get(b) ?? 1;
    const normalised = weight / Math.sqrt(na * nb);
    add(a, b, normalised);
    add(b, a, normalised);
  }
  return adjacency;
}

/** Facet decides how hard a tag pulls: themes hold territory, formats tint it. */
const FACET_PULL = {
  theme: 1,
  material: 0.9,
  method: 0.75,
  scale: 0.6,
  format: 0.35,
  open: 0.7,
};

export function buildGraph(atlas, options = {}) {
  const {
    minKinship = 0.12,
    maxKinPerSource = 4,
    lonelyFloor = 0.04,
    includeTagNodes = true,
    filterTags = [],
    query = '',
  } = options;

  const sources = atlas.listSources({ tags: filterTags, query, limit: 5000 });
  const allowed = new Set(sources.map((s) => s.id));
  const tagMap = new Map(
    [...atlas.tagMap()].filter(([id]) => allowed.has(id)),
  );
  const idf = idfWeights(tagMap, sources.length || 1);

  const tagRows = atlas.tagsWithCounts().filter((t) => tagMap.size === 0
    || [...tagMap.values()].some((tags) => tags.includes(t.slug)));
  const tagCounts = new Map(tagRows.map((t) => [t.slug, t.count]));
  const liveTags = new Set(tagRows.map((t) => t.slug));

  // — 1. cluster the vocabulary ————————————————————————————
  const cooccurrence = atlas
    .tagCooccurrence(1)
    .filter(({ a, b }) => liveTags.has(a) && liveTags.has(b));
  const adjacency = tagAdjacency(cooccurrence, tagCounts);
  const tagLabels = labelPropagate([...liveTags], adjacency);

  // Name each community after its most-used tag, and keep a stable index so
  // colours and angles don't shuffle between page loads.
  const communities = new Map();
  for (const slug of liveTags) {
    const key = tagLabels.get(slug) ?? slug;
    if (!communities.has(key)) communities.set(key, []);
    communities.get(key).push(slug);
  }
  const clusters = [...communities.entries()]
    .map(([key, slugs]) => {
      const members = slugs
        .map((slug) => tagRows.find((t) => t.slug === slug))
        .filter(Boolean)
        .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
      const head = members.find((m) => m.facet === 'theme') ?? members[0];
      return {
        key,
        label: head?.label ?? key,
        tags: members.map((m) => m.slug),
        weight: members.reduce((sum, m) => sum + m.count, 0),
      };
    })
    .sort((x, y) => y.weight - x.weight || x.label.localeCompare(y.label))
    .map((c, i) => ({ ...c, id: i }));

  const clusterOfTag = new Map();
  for (const cluster of clusters) {
    for (const slug of cluster.tags) clusterOfTag.set(slug, cluster.id);
  }

  // — 2. place each source in a cluster ————————————————————
  const clusterOfSource = new Map();
  for (const source of sources) {
    const votes = new Map();
    for (const slug of tagMap.get(source.id) ?? []) {
      const cluster = clusterOfTag.get(slug);
      if (cluster === undefined) continue;
      const facet = source.tags.find((t) => t.slug === slug)?.facet ?? 'open';
      const weight = (idf.get(slug) ?? 1) * (FACET_PULL[facet] ?? 0.7);
      votes.set(cluster, (votes.get(cluster) ?? 0) + weight);
    }
    let best = null;
    let bestScore = -Infinity;
    for (const [cluster, score] of votes) {
      if (score > bestScore || (score === bestScore && cluster < best)) {
        best = cluster;
        bestScore = score;
      }
    }
    clusterOfSource.set(source.id, best);
  }

  // — 3. nodes ——————————————————————————————————————————————
  const nodes = [];
  for (const source of sources) {
    nodes.push({
      id: `s:${source.id}`,
      type: 'source',
      sourceId: source.id,
      label: source.title,
      url: source.url,
      authors: source.authors,
      publisher: source.publisher,
      year: source.year,
      summary: source.summary,
      note: source.note,
      contributor: source.contributor,
      tags: (tagMap.get(source.id) ?? []).slice(),
      cluster: clusterOfSource.get(source.id),
      weight: (tagMap.get(source.id) ?? []).length,
    });
  }
  if (includeTagNodes) {
    for (const tag of tagRows) {
      nodes.push({
        id: `t:${tag.slug}`,
        type: 'tag',
        slug: tag.slug,
        label: tag.label,
        facet: tag.facet,
        note: tag.note,
        core: tag.core,
        count: tag.count,
        cluster: clusterOfTag.get(tag.slug),
        weight: tag.count,
      });
    }
  }

  // — 4. lines ——————————————————————————————————————————————
  const links = [];
  if (includeTagNodes) {
    for (const source of sources) {
      for (const tag of source.tags) {
        if (!liveTags.has(tag.slug)) continue;
        links.push({
          source: `s:${source.id}`,
          target: `t:${tag.slug}`,
          kind: 'tagged',
          weight: FACET_PULL[tag.facet] ?? 0.7,
        });
      }
    }
  }

  // Kinship: score every pair, then keep only each source's strongest few, so
  // the map stays a constellation rather than a hairball.
  const candidates = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i];
      const b = sources[j];
      const score = kinship(tagMap.get(a.id) ?? [], tagMap.get(b.id) ?? [], idf);
      if (score < Math.min(minKinship, lonelyFloor)) continue;
      const shared = (tagMap.get(a.id) ?? []).filter((t) => (tagMap.get(b.id) ?? []).includes(t));
      candidates.push({ a: a.id, b: b.id, score, shared });
    }
  }
  candidates.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);

  const degree = new Map();
  const taken = new Set();
  const draw = (c) => {
    const key = `${c.a}-${c.b}`;
    if (taken.has(key)) return false;
    taken.add(key);
    degree.set(c.a, (degree.get(c.a) ?? 0) + 1);
    degree.set(c.b, (degree.get(c.b) ?? 0) + 1);
    links.push({
      source: `s:${c.a}`,
      target: `s:${c.b}`,
      kind: 'kin',
      weight: Number(c.score.toFixed(4)),
      shared: c.shared,
    });
    return true;
  };

  for (const c of candidates) {
    if (c.score < minKinship) continue;
    if ((degree.get(c.a) ?? 0) >= maxKinPerSource && (degree.get(c.b) ?? 0) >= maxKinPerSource) continue;
    draw(c);
  }

  // Nothing should float entirely alone if it has any relation at all: a young
  // library is mostly weak ties, and a map of unconnected dots teaches nothing.
  for (const source of sources) {
    if ((degree.get(source.id) ?? 0) > 0) continue;
    const best = candidates.find(
      (c) => (c.a === source.id || c.b === source.id) && c.score >= lonelyFloor,
    );
    if (best) draw(best);
  }

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      sources: sources.length,
      tags: tagRows.length,
      links: links.length,
      kin: links.filter((l) => l.kind === 'kin').length,
      clusters: clusters.length,
    },
    clusters: clusters.map(({ key, ...rest }) => ({ ...rest, key })),
    nodes,
    links,
  };
}
