const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/spot-data.js');
require('../js/geojson-data.js');
const preview = require('../js/map-preview.js');
const baseline = require('../data/spots.json');
const empty = () => ({ type: 'FeatureCollection', features: [] });
const snapshot = () => ({ version: 1, id: 'preview-test', returnPage: 'editor.html', spots: structuredClone(baseline), geojson: empty() });
const storage = value => ({ getItem: () => JSON.stringify(value) });

test('ordinary map ignores all preview and draft storage', () => {
  assert.equal(preview.read(baseline, '', { getItem() { throw new Error('Should not access storage'); } }), null);
});
test('preview uses edited names without changing original spots', () => {
  const state = snapshot(); state.spots[0].name = 'Edited';
  const result = preview.read(baseline, '?preview=preview-test', storage(state));
  assert.equal(result.spots[0].name, 'Edited');
  assert.notEqual(baseline[0].name, 'Edited');
});
test('expired and malformed preview snapshots fail instead of showing published data', () => {
  assert.throws(() => preview.read(baseline, '?preview=old', storage(snapshot())), /更新/);
  assert.throws(() => preview.read(baseline, '?preview=preview-test', storage(null)), /見つからない/);
  assert.throws(() => preview.read(baseline, '?preview=preview-test', { getItem: () => '{invalid' }));
});
test('preview cannot change coordinates or redirect to an outside management page', () => {
  const state = snapshot(); state.spots[0].lat = 0;
  assert.throws(() => preview.validate(state, baseline));
  const external = snapshot(); external.returnPage = 'https://example.com';
  assert.throws(() => preview.validate(external, baseline));
});
test('valid added geometry is retained; invalid shapes are rejected', () => {
  const state = snapshot();
  state.geojson.features.push({ type: 'Feature', id: 'geo-test', properties: {}, geometry: { type: 'Point', coordinates: [139.48,36.13] }, gyoda: { name: 'New place', description: 'Description', category: 'other', color: '#54917f' } });
  assert.deepEqual(preview.validate(state,baseline).geojson,state.geojson);
  state.geojson.features[0].geometry.coordinates = [999,999];
  assert.throws(() => preview.validate(state,baseline));
});
test('point hits take priority over overlapping polygons', () => {
  const state = snapshot(); state.geojson.features = [{id:'geo-point'},{id:'geo-area'}];
  const map = { getLayer: () => true, queryRenderedFeatures: () => [
    {layer:{id:'preview-added-fill'},properties:{id:'geo-area'}},
    {layer:{id:'preview-added-point'},properties:{id:'geo-point'}}
  ] };
  assert.equal(preview.pick(map,{x:20,y:20},state).id,'geo-point');
  assert.equal(preview.pick(map,{x:20,y:20},null),null);
});
