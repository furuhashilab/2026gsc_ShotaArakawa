const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/spot-data.js');
const data = require('../js/publication-data.js');
const baseline = require('../data/spots.json');
const card = () => ({ ...data.fromSpot(baseline[0]), name: 'Published', description: 'Public text' });
test('publication overrides only six fields without mutating baseline or route coordinates', () => {
  const original = structuredClone(baseline);
  const merged = data.merge(baseline, [{ ...card(), lat: 0, lon: 0, category: 'other', owner_id: 'private' }]);
  assert.equal(merged[0].name, 'Published');
  assert.equal(merged[0].lat, baseline[0].lat);
  assert.equal(merged[0].category, baseline[0].category);
  assert.equal(merged[0].owner_id, undefined);
  assert.deepEqual(baseline, original);
  assert.deepEqual(merged.slice(1), baseline.slice(1));
});
test('empty publication and unknown IDs keep original cards', () => {
  assert.deepEqual(data.merge(baseline, []), baseline);
  assert.deepEqual(data.merge(baseline, [{ ...card(), spot_id: 'spot-999' }]), baseline);
});
test('invalid, NULL and unsafe URL publication cannot partially overwrite a card', () => {
  for (const patch of [{ photo: 'javascript:alert(1)' }, { photo: null }, { youtube: 'https://example.test/' }, { homepage: 'https://user:pass@example.com/' }, { name: '' }]) {
    assert.throws(() => data.validate({ ...card(), ...patch }));
    assert.deepEqual(data.merge(baseline, [{ ...card(), ...patch }]), baseline);
  }
});
test('duplicate publication IDs reject the response', () => {
  assert.throws(() => data.merge(baseline, [card(), card()]));
});
test('cleared URL stays blank; assets photo paths remain supported', () => {
  assert.equal(data.apply(baseline[0], { ...card(), photo: '' }).photo, '');
  assert.equal(data.apply(baseline[0], { ...card(), photo: 'assets/test.png' }).photo, 'assets/test.png');
});
test('public fetch uses only publication endpoint and public key, never a login session', async () => {
  const result = await data.load(baseline, async (url, options) => {
    assert.ok(url.includes('/rest/v1/spot_content_published?'));
    assert.deepEqual(Object.keys(options.headers), ['apikey']);
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => [card()] };
  });
  assert.equal(result[0].name, 'Published');
});
test('offline, HTTP errors and malformed responses fall back to original JSON', async () => {
  for (const fetcher of [async () => { throw Error('Offline'); }, async () => ({ ok: false, status: 503 }), async () => ({ ok: true, json: async () => ({ error: true }) })]) {
    assert.deepEqual(await data.load(baseline, fetcher), baseline);
  }
});
