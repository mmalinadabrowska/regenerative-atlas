/**
 * Bakes the library into the front end so it can be tested without a server.
 *
 * Writes two things:
 *
 *   public/data/snapshot.json  the read endpoints, pre-answered. public/ then
 *                              works as a plain static site — js/api.js falls
 *                              back to this whenever the API is not there.
 *   dist/atlas.html            the map as one self-contained file: styles,
 *                              scripts, fonts and data inlined, nothing to
 *                              fetch. For opening on a device.
 *
 *   node scripts/build-static.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../server/db.js';
import { buildGraph } from '../server/graph.js';
import { handlers } from '../server/api.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFileSync(resolve(ROOT, ...parts), 'utf8');

const atlas = openDatabase();
const snapshot = {
  builtAt: new Date().toISOString(),
  graph: buildGraph(atlas),
  tags: handlers.tags(atlas),
  vocabulary: handlers.vocabulary(),
  stats: handlers.stats(atlas),
  sources: handlers.sources(atlas, new URLSearchParams('limit=1000')),
};
atlas.close();

mkdirSync(resolve(ROOT, 'public', 'data'), { recursive: true });
writeFileSync(resolve(ROOT, 'public', 'data', 'snapshot.json'), JSON.stringify(snapshot));
console.log(
  `  snapshot: ${snapshot.stats.sources} sources, ${snapshot.stats.tags} tags ` +
    `-> public/data/snapshot.json`,
);

/* -------------------------------------------------------------------------
   One file, nothing to fetch.

   The browser modules are concatenated rather than left as imports, since a
   single file has nowhere to import from. Each becomes an IIFE returning its
   exports, and import lines become destructuring off that — which is why every
   module here keeps to plain `export function` / `export const` at the top
   level, and static imports.
   ------------------------------------------------------------------------- */

const MODULES = ['ink.js', 'pdf.js', 'api.js', 'constellation.js', 'connected-nav.js', 'map.js'];

function bundle() {
  const parts = ["const __m = {};"];
  for (const name of MODULES) {
    let body = read('public', 'js', name);

    const exported = [
      ...body.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm),
      ...body.matchAll(/^export\s+(?:const|let|class)\s+(\w+)/gm),
    ].map((match) => match[1]);

    body = body
      .replace(/^import\s*\{([^}]+)\}\s*from\s*'\.\/([\w.-]+)';?$/gm,
        (_, names, from) => `const {${names}} = __m['${from}'];`)
      .replace(/^export\s+/gm, '');

    parts.push(
      `__m['${name}'] = (() => {\n${body}\nreturn { ${exported.join(', ')} };\n})();`,
    );
  }
  return parts.join('\n\n');
}

/** Fonts have to travel in the file too, or the page is set in something else. */
function embedFonts(css) {
  return css.replace(
    /url\('\.\.\/fonts\/([^']+\.woff2?)'\)\s*format\('(woff2?)'\)/g,
    (whole, path, format) => {
      try {
        const data = readFileSync(resolve(ROOT, 'public', 'fonts', path)).toString('base64');
        return `url('data:font/${format};base64,${data}') format('${format}')`;
      } catch {
        return whole;
      }
    },
  );
}

const css = embedFonts(read('public', 'styles', 'atlas.css')).replace(
  /url\('\.\.\/fonts\/[^']+'\)\s*format\('opentype'\),?/g,
  '',
);

const mapBody = read('public', 'map.html')
  .replace(/[\s\S]*<body[^>]*>/, '')
  .replace(/<\/body>[\s\S]*/, '')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  // Nothing in a single file can navigate to another page, and a link that
  // cannot go anywhere is worse than no link: it takes the reader out of the
  // map and lands them on a 404. The marks stay — they say whose map this is —
  // but they stop being links, and the section row goes entirely.
  .replace(/<a class="topbar__brand"[^>]*>([\s\S]*?)<\/a>/, '<span class="topbar__brand">$1</span>')
  .replace(/<a class="atlas-mark"[^>]*>([\s\S]*?)<\/a>/, '<span class="atlas-mark">$1</span>')
  .replace(/<nav class="navgroup"[\s\S]*?<\/nav>/, '');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Regenerative Atlas — the map</title>
<style>
${css}
.standalone-note {
  position: absolute; right: 1rem; bottom: 1rem; max-width: 22rem;
  font-size: 0.72rem; line-height: 1.45; color: var(--ink-32); text-align: right;
  pointer-events: none;
}
.standalone-note a { pointer-events: auto; color: inherit; }
</style>
</head>
<body class="page">
${mapBody}
<p class="standalone-note">
  Static snapshot of ${snapshot.stats.sources} sources, ${snapshot.stats.tags} tags.
  Set in Enby Gertrude and Tremplin, post-binary faces from
  <a href="https://typotheque.byebyebinary.space">Bye Bye Binary</a> — the complete
  packages, and their licence, are in the
  <a href="https://github.com/mmalinadabrowska/regenerative-atlas">repository</a>.
</p>
<script type="module">
window.__ATLAS_SNAPSHOT__ = ${JSON.stringify(snapshot)};
${bundle()}
</script>
</body>
</html>
`;

mkdirSync(resolve(ROOT, 'dist'), { recursive: true });
writeFileSync(resolve(ROOT, 'dist', 'atlas.html'), html);
console.log(`  standalone: ${(html.length / 1024).toFixed(0)} KB -> dist/atlas.html`);

/* -------------------------------------------------------------------------
   The same page for publishing as an Artifact, which supplies its own document
   skeleton — so no doctype, html, head or body tags of our own, and the body
   itself becomes the column that .page usually is.
   ------------------------------------------------------------------------- */

const artifact = `<title>Regenerative Atlas</title>
<style>
${css}

/* The host supplies the document, so body takes the place of .page — and takes
   its height from the padded root rather than the raw viewport, so the map
   fits inside the phone's safe area instead of running under the system bars. */
html, body { height: 100%; }
body {
  display: flex;
  flex-direction: column;
  background: var(--paper);
}

.standalone-note {
  position: absolute; right: 1rem; bottom: 1rem; max-width: 22rem;
  font-size: 0.72rem; line-height: 1.45; color: var(--ink-32); text-align: right;
  pointer-events: none;
}
.standalone-note a { pointer-events: auto; color: inherit; }
@media (max-width: 46rem) { .standalone-note { display: none; } }
</style>
${mapBody}
<p class="standalone-note">
  Static snapshot of ${snapshot.stats.sources} sources, ${snapshot.stats.tags} tags.
  Set in Enby Gertrude and Tremplin, post-binary faces from
  <a href="https://typotheque.byebyebinary.space">Bye Bye Binary</a> — the complete
  packages, and their licence, are in the
  <a href="https://github.com/mmalinadabrowska/regenerative-atlas">repository</a>.
</p>
<script>
/* The artifact viewer sandboxes the page, and a sandboxed page cannot hand a
   file to whoever is reading it: an ordinary download link does nothing there.
   The host offers this instead — the page asks, the viewer confirms, the
   platform saves — so the hook the record's download button looks for is put
   in place here, where the host is, rather than in the app itself. If the
   capability is not granted the hook is never defined and the button falls
   back to the link, which is all a page can do on its own. */
window.claude?.use?.('downloads').then((downloads) => {
  if (!downloads) return;
  window.__ATLAS_SAVE__ = (filename, data) =>
    downloads.save({ filename, data }).catch(() => {});
});
</script>
<script type="module">
window.__ATLAS_SNAPSHOT__ = ${JSON.stringify(snapshot)};
${bundle()}
</script>
`;

writeFileSync(resolve(ROOT, 'dist', 'atlas-artifact.html'), artifact);
console.log(`  artifact:   ${(artifact.length / 1024).toFixed(0)} KB -> dist/atlas-artifact.html`);
