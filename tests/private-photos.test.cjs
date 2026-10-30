const test = require('node:test');
const assert = require('node:assert/strict');
const photos = require('../js/private-photos.js');
test('accept only supported, nonempty images within the input limit', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.doesNotThrow(() => photos.validateFile({ type, size: 100 }));
  for (const file of [null, { type: 'image/heic', size: 100 }, { type: 'image/svg+xml', size: 100 }, { type: 'image/png', size: 0 }, { type: 'image/jpeg', size: 20 * 1024 * 1024 + 1 }]) assert.throws(() => photos.validateFile(file));
});
test('resize preserves aspect ratio without enlargement and bounds pixel count', () => {
  assert.deepEqual(photos.dimensions(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(photos.dimensions(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(photos.dimensions(100, 80), { width: 100, height: 80 });
  assert.throws(() => photos.dimensions(10000, 10000));
  assert.throws(() => photos.dimensions(0, 10));
});
test('paths accept only the selected fixed ID and random filename', () => {
  const name = '00000000-0000-4000-8000-000000000001.webp';
  assert.equal(photos.objectPath('spot-001', name), 'spot-001/' + name);
  for (const [id, file] of [['../spot-001', name], ['spot-001', '../' + name], ['spot-001', 'original.jpg'], ['spot-001', name.replace('webp', 'svg')]]) assert.throws(() => photos.objectPath(id, file));
});
