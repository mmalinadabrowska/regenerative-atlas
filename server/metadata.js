/**
 * Reads a link so the contributor doesn't have to.
 *
 * Paste a URL and the Atlas goes and looks: DOIs are resolved through
 * doi.org's citation API, everything else is scraped for the usual metadata
 * (Highwire `citation_*` tags, Open Graph, Dublin Core, then plain <title>).
 * Whatever comes back is a *suggestion* — the contributor sees it in the form
 * and can correct every field before it is saved.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { CORE_TAGS, isCoreTag, resolveTag } from './vocabulary.js';

const TIMEOUT_MS = Number(process.env.ATLAS_FETCH_TIMEOUT ?? 12000);
const MAX_BYTES = 2 * 1024 * 1024;
const USER_AGENT =
  'RegenerativeAtlas/0.1 (+https://github.com/mmalinadabrowska/regenerative-atlas) link-metadata';

const DOI_RE = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i;

/** Private, loopback and link-local ranges we refuse to fetch from. */
function isPrivateAddress(address, family) {
  if (family === 6) {
    const a = address.toLowerCase();
    if (a === '::1' || a === '::') return true;
    if (a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')) return true;
    // IPv4-mapped, e.g. ::ffff:127.0.0.1
    const mapped = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1], 4);
    return false;
  }
  const [a, b] = address.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Guard against pointing the server at things that are not the public web.
 * The Atlas fetches URLs that strangers supply, so this matters.
 */
export async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error('That does not look like a web address.'), { status: 400 });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Object.assign(new Error('Only http and https links can be added.'), { status: 400 });
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw Object.assign(new Error('That address is not reachable from the public web.'), { status: 400 });
  }
  const literal = isIP(host);
  const addresses = literal
    ? [{ address: host, family: literal }]
    : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) {
    throw Object.assign(new Error('That domain could not be found.'), { status: 400 });
  }
  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) {
      throw Object.assign(new Error('That address is not reachable from the public web.'), { status: 400 });
    }
  }
  return url;
}

function decodeEntities(text) {
  if (!text) return '';
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
    ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö',
  };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => named[name.toLowerCase()] ?? m);
}

function clean(text, max = 600) {
  return decodeEntities(String(text ?? ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** All <meta> tags as a name/property -> values map, order preserved. */
function parseMeta(html) {
  const meta = new Map();
  const tagRe = /<meta\b[^>]*>/gi;
  for (const [tag] of html.matchAll(tagRe)) {
    const key =
      tag.match(/\b(?:name|property|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const value = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!key || value === undefined) continue;
    if (!meta.has(key)) meta.set(key, []);
    meta.get(key).push(clean(value));
  }
  return meta;
}

const pick = (meta, ...keys) => {
  for (const key of keys) {
    const values = meta.get(key);
    if (values?.length && values[0]) return values[0];
  }
  return '';
};

function parseYear(...candidates) {
  for (const value of candidates) {
    const year = String(value ?? '').match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
    if (year) return Number(year[1]);
  }
  return null;
}

async function readCapped(response) {
  const type = response.headers.get('content-type') ?? '';
  if (type && !/text\/html|application\/xhtml|text\/plain|json/i.test(type)) {
    return '';
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder('utf-8', { fatal: false }).decode(
    Buffer.concat(chunks.map((c) => Buffer.from(c))),
  );
}

async function fetchWithGuard(url, headers = {}) {
  await assertPublicUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*', ...headers },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** doi.org will hand back structured citation data — far better than scraping. */
async function fromDoi(doi) {
  const response = await fetchWithGuard(`https://doi.org/${encodeURIComponent(doi)}`, {
    accept: 'application/vnd.citationstyles.csl+json',
  });
  if (!response.ok) return null;
  const csl = await response.json().catch(() => null);
  if (!csl || typeof csl !== 'object') return null;

  const authors = (csl.author ?? [])
    .map((a) => [a.given, a.family].filter(Boolean).join(' ') || a.literal || '')
    .filter(Boolean)
    .join(', ');
  const issued = csl.issued?.['date-parts']?.[0]?.[0];

  return {
    title: clean(csl.title, 300),
    authors: clean(authors, 300),
    publisher: clean(csl['container-title'] || csl.publisher, 200),
    year: issued ? Number(issued) : parseYear(csl.created?.['date-time']),
    summary: clean(csl.abstract?.replace(/<[^>]+>/g, ' '), 800),
    via: 'doi',
  };
}

/**
 * Look up whatever a URL will tell us about itself.
 * Never throws for network reasons — a link the Atlas cannot read is still a
 * link worth keeping, the contributor just fills the form in by hand.
 */
export async function describeUrl(rawUrl) {
  const url = await assertPublicUrl(rawUrl);

  const doi = url.hostname.endsWith('doi.org')
    ? decodeURIComponent(url.pathname.slice(1))
    : rawUrl.match(DOI_RE)?.[1];

  if (doi && DOI_RE.test(doi)) {
    try {
      const found = await fromDoi(doi);
      if (found?.title) return { ...found, url: rawUrl, suggestedTags: suggestTags(found) };
    } catch {
      /* fall through to scraping */
    }
  }

  let html = '';
  try {
    const response = await fetchWithGuard(url.href);
    if (response.ok) html = await readCapped(response);
  } catch {
    html = '';
  }

  if (!html) {
    return {
      url: rawUrl,
      title: '',
      authors: '',
      publisher: url.hostname.replace(/^www\./, ''),
      year: null,
      summary: '',
      via: 'none',
      suggestedTags: [],
    };
  }

  return readMetadata(html, url);
}

/**
 * Pull a record out of a page's markup. Kept separate from fetching so it can
 * be tested against real-world HTML without going near the network.
 */
export function readMetadata(html, url) {
  const parsed = url instanceof URL ? url : new URL(url);
  const meta = parseMeta(html);
  const authors = (meta.get('citation_author') ?? meta.get('dc.creator') ?? [])
    .filter(Boolean)
    .join(', ');

  const described = {
    url: parsed.href,
    title:
      clean(pick(meta, 'citation_title', 'og:title', 'dc.title', 'twitter:title'), 300) ||
      clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 300),
    authors: clean(authors || pick(meta, 'author', 'article:author'), 300),
    publisher: clean(
      pick(meta, 'citation_journal_title', 'og:site_name', 'citation_publisher', 'dc.publisher') ||
        parsed.hostname.replace(/^www\./, ''),
      200,
    ),
    year: parseYear(
      pick(meta, 'citation_publication_date', 'citation_date', 'article:published_time', 'dc.date'),
    ),
    summary: clean(pick(meta, 'description', 'og:description', 'dc.description', 'citation_abstract'), 800),
    via: 'page',
  };

  described.suggestedTags = suggestTags(described);
  return described;
}

/**
 * Keyword index built from the vocabulary itself, so suggestions stay in step
 * with the curated tags rather than drifting into a second hard-coded list.
 */
const KEYWORDS = (() => {
  const index = [];
  const add = (phrase, slug, weight) => {
    const term = String(phrase).toLowerCase().trim();
    if (term.length < 4) return;
    index.push({ term, slug, weight });
  };
  for (const tag of CORE_TAGS) {
    add(tag.label, tag.slug, 3);
    add(tag.slug.replace(/-/g, ' '), tag.slug, 3);
  }
  for (const phrase of [
    'embodied carbon', 'whole life carbon', 'net zero', 'circular economy', 'life cycle',
    'cross laminated', 'mass timber', 'rammed earth', 'straw bale', 'passivhaus',
    'biodiversity net gain', 'nature based', 'case study', 'design guide', 'white paper',
    'regenerative design', 'living building', 'material passport', 'adaptive reuse',
    'doughnut economics', 'planetary boundaries', 'indigenous', 'agroecology', 'permaculture',
  ]) {
    const resolved = resolveTag(phrase);
    // Only ever suggest curated tags — inventing new vocabulary is the
    // contributor's privilege, not the scraper's.
    if (resolved && isCoreTag(resolved.slug)) add(phrase, resolved.slug, 4);
  }
  return index;
})();

/** Guess a handful of tags from whatever text we managed to read. */
export function suggestTags(described, limit = 6) {
  const haystack = [described.title, described.summary, described.publisher]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return [];

  const scores = new Map();
  for (const { term, slug, weight } of KEYWORDS) {
    if (!haystack.includes(term)) continue;
    // Whole-word-ish check so "art" never matches inside "earth".
    const boundary = new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
    if (!boundary.test(haystack)) continue;
    scores.set(slug, (scores.get(slug) ?? 0) + weight + term.length / 20);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([slug]) => slug);
}
