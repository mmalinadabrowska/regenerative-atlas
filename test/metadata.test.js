import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicUrl, placeFromHost, readMetadata, suggestTags } from '../server/metadata.js';

test('only public http(s) addresses are fetchable', async () => {
  const refused = [
    'http://localhost:3000/admin',
    'http://127.0.0.1/',
    'https://127.0.0.1:8443/',
    'http://192.168.0.1/',
    'http://10.1.2.3/',
    'http://172.16.9.9/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://box.local/',
    'file:///etc/passwd',
    'ftp://example.org/x',
    'javascript:alert(1)',
    'not a url at all',
  ];
  for (const url of refused) {
    await assert.rejects(assertPublicUrl(url), undefined, `${url} should have been refused`);
  }
});

test('a normal public address is allowed', async () => {
  const url = await assertPublicUrl('https://example.org/some/paper?x=1');
  assert.equal(url.hostname, 'example.org');
});

test('Highwire citation tags are preferred over Open Graph and <title>', () => {
  const html = `
    <html><head>
      <title>Publisher site — page 4 | Journal</title>
      <meta property="og:title" content="A rougher title">
      <meta name="citation_title" content="Shifting from sustainability to regeneration">
      <meta name="citation_author" content="Reed, Bill">
      <meta name="citation_author" content="Mang, Pamela">
      <meta name="citation_journal_title" content="Building Research &amp; Information">
      <meta name="citation_publication_date" content="2007/11/01">
      <meta name="description" content="A paper on regenerative design and living systems.">
    </head></html>`;
  const record = readMetadata(html, new URL('https://www.tandfonline.com/doi/abs/10.1080/x'));
  assert.equal(record.title, 'Shifting from sustainability to regeneration');
  assert.equal(record.authors, 'Reed, Bill, Mang, Pamela');
  assert.equal(record.publisher, 'Building Research & Information');
  assert.equal(record.year, 2007);
  assert.match(record.summary, /regenerative design/);
});

test('a page with nothing but a title still yields a usable record', () => {
  const html = '<html><head><title>  Material  Cultures &mdash; Research  </title></head></html>';
  const record = readMetadata(html, new URL('https://www.materialcultures.org/research'));
  assert.equal(record.title, 'Material Cultures — Research');
  assert.equal(record.publisher, 'materialcultures.org');
  assert.equal(record.year, null);
  assert.equal(record.authors, '');
});

test('single-quoted and self-closing meta tags are read too', () => {
  const html = `<meta property='og:title' content='Straw bale construction' />
                <meta property="og:site_name" content="Test Press"/>`;
  const record = readMetadata(html, new URL('https://example.org/a'));
  assert.equal(record.title, 'Straw bale construction');
  assert.equal(record.publisher, 'Test Press');
});

test('suggestions come only from the curated vocabulary', () => {
  const suggested = suggestTags({
    title: 'Embodied carbon in cross laminated timber: a life-cycle assessment case study',
    summary: 'Whole life carbon compared against concrete at building scale.',
  });
  assert.ok(suggested.includes('carbon'));
  assert.ok(suggested.includes('timber'));
  assert.ok(suggested.includes('life-cycle-assessment'));
  assert.equal(suggested.includes('cross-laminated'), false, 'never invent vocabulary');
  assert.ok(suggested.length <= 6);
});

test('suggestions match whole words, not fragments inside other words', () => {
  // "earth" must not be found inside "unearthed", nor "soil" inside "soiled".
  const suggested = suggestTags({ title: 'Unearthed and soiled: a history', summary: '' });
  assert.equal(suggested.includes('earth'), false);
  assert.equal(suggested.includes('soil'), false);
});

test('nothing to read means nothing suggested', () => {
  assert.deepEqual(suggestTags({ title: '', summary: '', publisher: '' }), []);
});

test('a country-code domain offers a place, and a generic one offers none', () => {
  assert.equal(placeFromHost('www.leti.uk'), 'uk');
  assert.equal(placeFromHost('example.com.au'), 'australia');
  assert.equal(placeFromHost('new-european-bauhaus.europa.eu'), 'europe');
  assert.equal(placeFromHost('rmi.org'), null);
  assert.equal(placeFromHost(''), null);
  assert.equal(placeFromHost(undefined), null);
});

test('the domain’s place is the last suggestion, never the loudest', () => {
  const suggested = readMetadata(
    '<html><head><title>Embodied carbon in timber</title>' +
      '<meta name="description" content="Whole life carbon and mass timber."></head></html>',
    new URL('https://example.uk/paper'),
  ).suggestedTags;
  assert.equal(suggested.at(-1), 'uk');
  assert.ok(suggested.includes('carbon'));
});
