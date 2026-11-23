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
      if (found?.title) return { ...found, url: rawUrl, suggestedTags: withPlace(suggestTags(found), url.hostname) };
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
      suggestedTags: withPlace([], url.hostname),
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

  described.suggestedTags = withPlace(suggestTags(described), parsed.hostname);
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

/**
 * A place, guessed from the domain the link lives on.
 *
 * It is the weakest signal on the page and the only one that does not come from
 * what the work says, so it goes in last and is only ever a suggestion: a
 * country-code domain says where a thing was published, which is usually but
 * not always where it is grounded. The contributor unticks it when it is wrong,
 * which is one press, and is spared typing it when it is right, which is most
 * of the time.
 */
const CCTLD = new Map(Object.entries({
  uk: 'uk', ie: 'ireland', fr: 'france', de: 'germany', nl: 'netherlands',
  dk: 'denmark', se: 'sweden', no: 'norway', fi: 'finland', es: 'spain',
  it: 'italy', ch: 'switzerland', be: 'europe', at: 'europe', pt: 'europe',
  pl: 'europe', eu: 'europe', ca: 'canada', mx: 'mexico', br: 'brazil',
  cl: 'chile', co: 'colombia', au: 'australia', nz: 'new-zealand',
  za: 'south-africa', ke: 'kenya', ng: 'nigeria', in: 'india', cn: 'china',
  jp: 'japan', sg: 'singapore', id: 'indonesia',
}));

export function placeFromHost(hostname) {
  const last = String(hostname ?? '').toLowerCase().split('.').pop();
  return CCTLD.get(last) ?? null;
}

/** Suggestions, with the domain's country appended when it has one to give. */
function withPlace(tags, hostname) {
  const place = placeFromHost(hostname);
  return place && !tags.includes(place) ? [...tags, place] : tags;
}

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

/* --- the picture a page offers of itself ----------------------------------
   Most pages name one image to stand for them when they are shared — Open
   Graph's og:image, Twitter's card image, the older image_src link. That is the
   first picture the Atlas tries for a piece of research: the one its own
   authors chose, rather than one the Atlas went looking for. */

/* Pictures, not marks.
   The picture a page names for itself is often not a picture at all: a logo,
   the site's name set in type, the same banner every page on the site shares.
   So every picture a page offers is a candidate — the one it names for itself,
   then the figures in its text, then the larger pictures in its body — and the
   ones that say what they are by name (logo, icon, avatar…), that are too small
   or too long and thin to be anything but a mark, or that sit in the page's
   header, navigation or footer, are left out. What is left is tried in order;
   the browser has the last word, looking at the pixels themselves (see
   looksLikeAPicture in public/js/dither.js).

   Each candidate carries what the page says about it — a caption, and who
   made it when that is said — so the picture can be credited where it is shown. */

const MAX_CANDIDATES = 6;
const MARKS =
  /(?:^|[^a-z])(?:logos?|logotype|icons?|favicon|sprites?|avatars?|badges?|wordmark|brand(?:ing|mark)?|emblem|placeholder|default|fallback|share[-_ ]?(?:image|card)|social[-_ ]?(?:image|card|share)|og[-_]?default|apple-touch|gravatar|spacer|blank|pixel|qr[-_ ]?code|signature|seal|flag)(?:[^a-z]|$)/i;

/** The attributes of one tag, by lower-cased name. */
function attributesOf(tag) {
  const found = new Map();
  for (const [, name, , quoted, bare] of tag.matchAll(/([a-z_:][-a-z0-9_:.]*)\s*=\s*(["'])?((?:(?!\2)[\s\S])*?)\2(?=[\s/>])|([a-z_:][-a-z0-9_:.]*)(?=[\s/>])/gi)) {
    if (name) found.set(name.toLowerCase(), decodeEntities(quoted ?? ''));
    else if (bare) found.set(bare.toLowerCase(), '');
  }
  return found;
}

/** Text with its tags taken out. */
const textOf = (html) => clean(String(html ?? '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '));

/** The largest picture a srcset offers. */
function largestOf(srcset) {
  let best = null;
  let bestSize = -1;
  for (const part of String(srcset ?? '').split(/,\s+(?=\S)/)) {
    const [href, size = '1x'] = part.trim().split(/\s+/);
    const n = parseFloat(size) * (/x$/i.test(size) ? 1000 : 1);
    if (href && n > bestSize) {
      best = href;
      bestSize = n;
    }
  }
  return best;
}

function absolute(href, base) {
  if (!href || /^data:/i.test(href.trim())) return null;
  try {
    const resolved = new URL(href.trim(), base);
    return /^https?:$/.test(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

/** A picture's own name, without the size a CMS adds to its copies. */
const stemOf = (href) => {
  try {
    return decodeURIComponent(new URL(href).pathname.split('/').pop() ?? '')
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[-_@](?:\d+x\d+|\d{2,4}w?|scaled|large|medium|full|\dx)$/g, '');
  } catch {
    return '';
  }
};

/**
 * A caption split into what it says and who it credits: "The hall in use.
 * Photo: Jane Doe" → { caption: 'The hall in use.', credit: 'Photo: Jane Doe' }.
 */
export function splitCredit(text) {
  const said = clean(text, 400);
  const match = said.match(CREDIT);
  if (!match) return { caption: said, credit: '' };
  const credit = match[1].trim().replace(/[\s,.;:–—-]+$/, '');
  const caption = said.slice(0, match.index + (match[0].length - match[0].trimStart().length)).replace(/[\s(,;:|–—-]+$/, '').trim();
  return { caption, credit: credit.length > 2 ? credit : '' };
}

// A credit names someone: "Photo: Jane Doe", "Image courtesy of Studio X",
// "Photograph by Ann Lee", "© 2020 Arup" — a word for a picture followed by a
// name, not just any sentence with "photos" or "diagram" in it. Case matters
// for the name, so the words are spelled to match in either case by hand.
const either = (word) => word.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
const PICTURE_WORD = ['photo', 'photos', 'photograph', 'photographs', 'photography', 'image', 'images', 'picture',
  'pictures', 'illustration', 'illustrations', 'diagram', 'drawing', 'render', 'rendering', 'visualisation',
  'visualization', 'credit', 'credits', 'courtesy', 'source'].map(either).join('|');
const LINK_WORD = ['by', 'courtesy of', 'courtesy', 'credit', 'of'].map(either).join('|');
const NAME = String.raw`[\p{Lu}\p{N}©@][^.;|()]*`;
const CREDIT = new RegExp(
  String.raw`(?:^|[\s.;,(|–—-])((?:${PICTURE_WORD})(?:\s+(?:${LINK_WORD}))*\s*:?\s*${NAME}|(?:©|\([cC]\)|${either('copyright')})\s*\S[^.;|()]*)\)?\s*\.?\s*$`,
  'u',
);

const looksLikeAMark = (...said) => said.some((text) => MARKS.test(String(text ?? '')));

function sizeRules(attrs) {
  const width = parseFloat(attrs.get('width'));
  const height = parseFloat(attrs.get('height'));
  if ((width && width < 200) || (height && height < 140)) return false;
  if (width && height && (width / height > 3.2 || height / width > 3.2)) return false;
  return true;
}

/**
 * Every picture a page offers that might show the research, best first, each
 * { src, caption, credit, named } — named for the one the page names for itself.
 */
export function readImages(html, url) {
  const base = url instanceof URL ? url : new URL(url);
  const meta = parseMeta(html);
  const found = [];
  const seen = new Set();
  const add = (candidate) => {
    if (!candidate.src || seen.has(candidate.src)) return;
    if (/\.(?:svg|ico|gif)(?:[?#]|$)/i.test(new URL(candidate.src).pathname)) return;
    seen.add(candidate.src);
    found.push(candidate);
  };

  // 1. The picture the page names for itself.
  const named = absolute(
    pick(meta, 'og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src') ||
      html.match(/<link\b[^>]*\brel\s*=\s*["']image_src["'][^>]*>/i)?.[0]?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1],
    base,
  );
  const namedWidth = Number(pick(meta, 'og:image:width')) || 0;
  const namedHeight = Number(pick(meta, 'og:image:height')) || 0;
  const namedAlt = pick(meta, 'og:image:alt', 'twitter:image:alt');
  if (named && !looksLikeAMark(new URL(named).pathname, namedAlt) &&
      sizeRules(new Map([['width', namedWidth || ''], ['height', namedHeight || '']]))) {
    add({ src: named, ...splitCredit(namedAlt), named: true });
  }

  // The page's own text: without its head, header, navigation, footer and
  // asides, where logos and badges live; the main part of it if it says which.
  let body = html.replace(/<head\b[\s\S]*?<\/head>/i, ' ');
  body = body.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? body.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? body;
  body = body
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(header|nav|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');

  const fromImg = (tag, extra = {}) => {
    const attrs = attributesOf(tag);
    const said = [attrs.get('class'), attrs.get('id'), attrs.get('alt'), attrs.get('src'), attrs.get('data-src')].join(' ');
    if (looksLikeAMark(said) || attrs.get('role') === 'presentation' || attrs.get('aria-hidden') === 'true') return null;
    if (!sizeRules(attrs)) return null;
    const src = absolute(
      largestOf(attrs.get('srcset') || attrs.get('data-srcset')) ||
        attrs.get('data-src') || attrs.get('data-lazy-src') || attrs.get('data-original') || attrs.get('src'),
      base,
    );
    if (!src) return null;
    const alt = clean(attrs.get('alt') ?? '', 400);
    return { src, alt, width: parseFloat(attrs.get('width')) || 0, ...extra };
  };

  // 2. Figures: a picture the text puts forward, usually with a caption.
  const figures = [];
  for (const [figure] of body.matchAll(/<figure\b[\s\S]*?<\/figure>/gi)) {
    const img = figure.match(/<img\b[^>]*>/i)?.[0];
    if (!img) continue;
    const credited = figure.match(/<([a-z]+)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:credit|copyright|attribution|byline)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i);
    const captionHtml = figure.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] ?? '';
    let { caption, credit } = splitCredit(textOf(credited ? captionHtml.replace(credited[0], ' ') : captionHtml));
    if (credited) credit = textOf(credited[2]) || credit;
    const candidate = fromImg(img);
    if (!candidate) continue;
    figures.push({ src: candidate.src, caption: (caption || candidate.alt).slice(0, 200), credit: credit.slice(0, 120), named: false });
  }

  // 3. The larger pictures in the text, the larger first.
  const others = [];
  for (const [img] of body.replace(/<figure\b[\s\S]*?<\/figure>/gi, ' ').matchAll(/<img\b[^>]*>/gi)) {
    const candidate = fromImg(img);
    if (!candidate) continue;
    others.push({ src: candidate.src, ...splitCredit(candidate.alt), named: false, width: candidate.width });
  }
  others.sort((a, b) => (b.width || 0) - (a.width || 0));

  for (const figure of figures) add(figure);
  for (const other of others) add({ src: other.src, caption: other.caption.slice(0, 200), credit: other.credit.slice(0, 120), named: false });

  // The picture the page names for itself is often one of its figures too,
  // where it has a caption and a credit; it borrows them.
  const first = found[0];
  if (first?.named) {
    const twin = found.find((c) => !c.named && stemOf(c.src) && stemOf(c.src) === stemOf(first.src));
    if (twin) {
      first.caption = twin.caption || first.caption;
      first.credit = twin.credit || first.credit;
    }
  }
  return found.slice(0, MAX_CANDIDATES);
}

/** The name the site goes by, for the credit: its own name for itself, or its address. */
export function siteOf(html, url) {
  const name = pick(parseMeta(html), 'og:site_name', 'application-name');
  if (name && name.length <= 60) return name;
  return new URL(url).hostname.replace(/^www\./, '');
}

/** The picture a page names for itself, as an absolute http(s) URL, or null. */
export function readImage(html, url) {
  return readImages(html, url).find((c) => c.named)?.src ?? null;
}

async function readPage(href) {
  const response = await fetchWithGuard(href);
  if (!response.ok) return null;
  const html = await readCapped(response);
  return html ? { html, url: response.url || href } : null;
}

const within = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms).unref?.())]);

/**
 * Fetch a page and list the pictures it offers (see readImages), with the
 * site's name. The picture it names for itself is dropped when the site's
 * front page names the same one: that is the site's banner, not this
 * research's picture.
 */
export async function findImages(pageUrl, { read = readPage } = {}) {
  const url = await assertPublicUrl(pageUrl);
  const page = await read(url.href);
  if (!page) return { site: url.hostname.replace(/^www\./, ''), candidates: [] };
  let candidates = readImages(page.html, page.url);
  const named = candidates.find((c) => c.named);
  const home = new URL('/', page.url).href;
  if (named && home !== page.url) {
    const front = await within(read(home).catch(() => null), 4000);
    if (front && readImages(front.html, front.url).some((c) => c.named && c.src === named.src)) {
      candidates = candidates.filter((c) => c !== named);
    }
  }
  return { site: siteOf(page.html, page.url), candidates };
}

/** Fetch a page and read the picture it names for itself. */
export async function findImage(pageUrl) {
  const { candidates } = await findImages(pageUrl);
  return candidates[0]?.src ?? null;
}

/**
 * Only pictures a canvas can read and nothing that can carry script: no SVG,
 * which is a document as much as an image, and would be served from the
 * Atlas' own address.
 */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Fetch a picture, held to the types above and to a size a page can carry. */
export async function fetchImage(imageUrl) {
  const response = await fetchWithGuard(imageUrl, { accept: IMAGE_TYPES.join(',') });
  if (!response.ok) return null;
  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type)) return null;
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_IMAGE_BYTES) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return { type, body: Buffer.concat(chunks) };
}
