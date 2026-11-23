import test from 'node:test';
import assert from 'node:assert/strict';
import { findImages, readImage, readImages, splitCredit } from '../server/metadata.js';
import { imageFor, pictureHeaders } from '../server/images.js';

const page = (head) => `<!doctype html><html><head>${head}</head><body></body></html>`;

test('the picture a page names for itself is read, and made absolute', () => {
  assert.equal(
    readImage(page('<meta property="og:image" content="/media/hall.jpg">'), 'https://example.org/project/'),
    'https://example.org/media/hall.jpg',
  );
  assert.equal(
    readImage(page('<meta name="twitter:image" content="https://cdn.example.org/a.png">'), 'https://example.org/'),
    'https://cdn.example.org/a.png',
  );
  assert.equal(
    readImage(page('<link rel="image_src" href="cover.webp">'), 'https://example.org/books/x'),
    'https://example.org/books/cover.webp',
  );
});

test('a page that names no picture, or names something that is not one, has none', () => {
  assert.equal(readImage(page('<title>Nothing</title>'), 'https://example.org/'), null);
  assert.equal(readImage(page('<meta property="og:image" content="javascript:alert(1)">'), 'https://example.org/'), null);
});

test('only research in the library is ever looked up', async () => {
  let looked = 0;
  const find = async () => {
    looked += 1;
    return { site: 'example.org', candidates: [{ src: 'https://example.org/a.jpg', caption: '', credit: '' }] };
  };
  const fetchOne = async () => ({ type: 'image/jpeg', body: Buffer.from('jpeg') });
  const inLibrary = async (url) => url === 'https://example.org/in';

  assert.equal(await imageFor('https://evil.example/anything', inLibrary, { find, fetchOne }), null);
  assert.equal(await imageFor('', inLibrary, { find, fetchOne }), null);
  assert.equal(looked, 0, 'nothing outside the library is fetched');

  const found = await imageFor('https://example.org/in', inLibrary, { find, fetchOne });
  assert.equal(found.type, 'image/jpeg');
});

test('a page that cannot be read means no picture, not an error', async () => {
  const inLibrary = async () => true;
  const find = async () => {
    throw new Error('unreachable');
  };
  assert.equal(await imageFor('https://example.org/in', inLibrary, { find }), null);
  assert.equal(await imageFor('https://example.org/in', inLibrary, { find: async () => ({ candidates: [] }) }), null);
});

test('the web function answers 404 for anything not in the published library', async () => {
  const { default: handler } = await import('../api/image.js');
  const result = await new Promise((resolve) => {
    const res = {
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      end() {
        resolve({ status: this.status, headers: this.headers });
      },
    };
    handler({ method: 'GET', url: '/api/image?for=https%3A%2F%2Fnot-in-the-atlas.example%2F', headers: {} }, res);
  });
  assert.equal(result.status, 404);
  assert.match(result.headers['cache-control'], /max-age/);
});

const article = `<!doctype html><html><head>
<meta property="og:site_name" content="Terrapin Bright Green">
<meta property="og:image" content="https://ex.org/uploads/hall-1200x630.jpg">
</head><body>
<header><img src="/img/plain.png" width="400" height="300"></header>
<main>
<figure><img src="/uploads/hall.jpg" srcset="/uploads/hall-300.jpg 300w, /uploads/hall-1600.jpg 1600w" alt="hall">
<figcaption>The meeting hall in daylight. Photo: Jane Doe</figcaption></figure>
<figure><img data-src="/uploads/wheel.png" width="900" height="600">
<figcaption>Fourteen patterns as a wheel <span class="photo-credit">© Terrapin, 2014</span></figcaption></figure>
<img src="/uploads/company-logo.jpg" width="600" height="300">
<img src="/uploads/author-avatar.jpg" width="400" height="400">
<img src="/uploads/tiny.jpg" width="40" height="40">
<img src="/uploads/strip.jpg" width="1600" height="200">
<img src="/uploads/plan.jpg" width="800" height="500" alt="Ground floor plan (Image courtesy of Studio X)">
<img src="/uploads/mark.svg" width="800" height="500">
</main>
<footer><img src="/f/partner.jpg" width="300" height="300"></footer>
</body></html>`;

test('every picture a page offers is a candidate, best first, and its marks are not', () => {
  const found = readImages(article, 'https://ex.org/research/x');
  assert.deepEqual(found.map((c) => c.src), [
    'https://ex.org/uploads/hall-1200x630.jpg',
    'https://ex.org/uploads/hall-1600.jpg',
    'https://ex.org/uploads/wheel.png',
    'https://ex.org/uploads/plan.jpg',
  ]);
  // The picture the page names for itself borrows its figure's caption and credit.
  assert.equal(found[0].caption, 'The meeting hall in daylight.');
  assert.equal(found[0].credit, 'Photo: Jane Doe');
  assert.equal(found[2].credit, '© Terrapin, 2014');
  assert.equal(found[3].caption, 'Ground floor plan');
  assert.equal(found[3].credit, 'Image courtesy of Studio X');
  assert.equal(readImage(article, 'https://ex.org/research/x'), 'https://ex.org/uploads/hall-1200x630.jpg');
});

test('a picture the page names for itself is passed over when it says it is a logo', () => {
  const html = page('<meta property="og:image" content="https://ex.org/img/logo-share.png">');
  assert.deepEqual(readImages(html, 'https://ex.org/'), []);
});

test('a credit is told from a caption by the name it gives', () => {
  assert.deepEqual(splitCredit('A courtyard. Photograph by Ann Lee.'), { caption: 'A courtyard.', credit: 'Photograph by Ann Lee' });
  assert.deepEqual(splitCredit('Rooftop farm (Credit: Sam Ono)'), { caption: 'Rooftop farm', credit: 'Credit: Sam Ono' });
  assert.deepEqual(splitCredit('© 2020 Arup'), { caption: '', credit: '© 2020 Arup' });
  assert.equal(splitCredit('Diagram: the nested loops').credit, '');
  assert.equal(splitCredit('A street lined with photos of trees').credit, '');
});

test("a site's banner — the picture its front page names too — is not the research's picture", async () => {
  const pages = {
    'https://93.184.216.34/research/x': article,
    'https://93.184.216.34/': page('<meta property="og:image" content="https://ex.org/uploads/hall-1200x630.jpg">'),
  };
  const read = async (href) => (pages[href] ? { html: pages[href], url: href } : null);
  const { site, candidates } = await findImages('https://93.184.216.34/research/x', { read });
  assert.equal(site, 'Terrapin Bright Green');
  assert.equal(candidates[0].src, 'https://93.184.216.34/uploads/hall-1600.jpg');
});

test('the pictures are handed over one at a time, saying whether there is another', async () => {
  const inLibrary = async () => true;
  const find = async () => ({
    site: 'Example',
    candidates: [
      { src: 'https://ex.org/a.jpg', caption: 'A', credit: 'Photo: B' },
      { src: 'https://ex.org/broken.jpg', caption: '', credit: '' },
    ],
  });
  const fetchOne = async (src) => (src.includes('broken') ? null : { type: 'image/jpeg', body: Buffer.from('x') });
  const first = await imageFor('https://ex.org/in', inLibrary, { find, fetchOne });
  assert.equal(first.more, true);
  assert.equal(first.credit, 'Photo: B');
  assert.deepEqual(await imageFor('https://ex.org/in', inLibrary, { pick: 1, find, fetchOne }), { more: false });
  assert.equal(await imageFor('https://ex.org/in', inLibrary, { pick: 2, find, fetchOne }), null);

  const headers = pictureHeaders({ ...first, site: 'Café Ö' });
  assert.equal(decodeURIComponent(headers['x-picture-site']), 'Café Ö');
  assert.match(headers['x-picture-site'], /^[\x20-\x7e]*$/, 'header values stay ASCII');
  assert.equal(headers['x-picture-more'], '1');
});

test('a file name is no caption, but the credit in it is kept', async () => {
  const { describedBy } = await import('../server/metadata.js');
  assert.deepEqual(
    describedBy('Tipping_Point_East_For_The_Architectural_Review_©_Henry_Woide_Low Res_001.jpg'),
    { caption: '', credit: '© Henry Woide' },
  );
  assert.deepEqual(describedBy('IMG_4021.JPG'), { caption: '', credit: '' });
  assert.deepEqual(describedBy('The meeting hall. Photo: Jane Doe'), { caption: 'The meeting hall.', credit: 'Photo: Jane Doe' });
  const found = readImages(page('<meta property="og:image" content="https://x.org/u/Studio_shot_%C2%A9_Ann_Lee_final.jpg">'), 'https://x.org/p');
  assert.equal(found[0].credit, '© Ann Lee');
});
