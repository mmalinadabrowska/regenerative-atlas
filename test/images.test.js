import test from 'node:test';
import assert from 'node:assert/strict';
import { readImage } from '../server/metadata.js';
import { imageFor } from '../server/images.js';

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
    return 'https://example.org/a.jpg';
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
  assert.equal(await imageFor('https://example.org/in', inLibrary, { find: async () => null }), null);
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
