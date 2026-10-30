const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../js/geojson-data.js');
const point = { type: 'Feature', id: 12, properties: { 名称: '新しい地点', 説明: '説明です', nested: { source: 'original' } }, geometry: { type: 'Point', coordinates: [139.46, 36.14] } };
const line = { type: 'Feature', properties: { 名称: '散策路' }, geometry: { type: 'LineString', coordinates: [[139.45, 36.13], [139.47, 36.14]] } };
const polygon = { type: 'Feature', properties: { 名称: '観光エリア' }, geometry: { type: 'Polygon', coordinates: [[[139.47,36.12],[139.49,36.12],[139.49,36.14],[139.47,36.12]], [[139.481,36.125],[139.485,36.125],[139.485,36.127],[139.481,36.125]]] } };
const source = { type: 'FeatureCollection', features: [point, line, polygon] };
const settings = { nameKey: '名称', descriptionKey: '説明', category: 'other', color: '#54917f' };
let nextId = 0;
const prepare = data => api.prepare(api.parse(JSON.stringify(data)), settings, () => `geo-test-${++nextId}`);
const empty = () => ({ type: 'FeatureCollection', features: [] });

test('mixed geometry is counted and kept intact including polygon holes', () => {
  const result = api.parse(JSON.stringify(source));
  assert.deepEqual(result.counts, { 点: 1, 線: 1, 面: 1 });
  assert.deepEqual(result.collection, source);
  assert.deepEqual(result.bounds, [139.45,36.12,139.49,36.14]);
});
test('Feature and bare geometry inputs are supported', () => {
  assert.equal(api.parse(JSON.stringify(point)).collection.features.length, 1);
  assert.equal(api.parse(JSON.stringify(point.geometry)).collection.features.length, 1);
});
test('all multi geometries are supported without flattening', () => {
  for (const [type, coordinates] of [['MultiPoint',[point.geometry.coordinates]], ['MultiLineString',[line.geometry.coordinates]], ['MultiPolygon',[polygon.geometry.coordinates]]]) {
    const result = api.parse(JSON.stringify({ type, coordinates }));
    assert.deepEqual(result.collection.features[0].geometry, { type, coordinates });
  }
});
test('attribute mapping preserves geometry, raw properties and source ID', () => {
  const result = prepare(source);
  assert.equal(result.features[0].gyoda.name, '新しい地点');
  assert.equal(result.features[0].gyoda.description, '説明です');
  assert.equal(result.features[0].gyoda.sourceId, 12);
  assert.deepEqual(result.features[0].properties, point.properties);
  assert.deepEqual(result.features[2].geometry, polygon.geometry);
});
test('export and reimport preserve metadata and permanent IDs', () => {
  const original = prepare(source);
  const parsed = api.parse(api.exportText(original));
  const roundTrip = api.prepare(parsed, settings);
  assert.deepEqual(roundTrip, original);
  assert.throws(() => api.append(original, roundTrip), /固定ID/);
});
test('addition appends without mutating existing objects', () => {
  const existing = prepare(point), incoming = prepare(line);
  const snapshot = structuredClone(existing);
  assert.equal(api.append(existing, incoming).features.length, 2);
  assert.deepEqual(existing, snapshot);
});
test('invalid files reject the entire import', () => {
  const invalid = structuredClone(source);
  invalid.features[1].geometry.coordinates[0] = [36, 139];
  assert.throws(() => api.parse(JSON.stringify(invalid)), /2件目/);
  assert.throws(() => api.parse('{oops'), /JSON/);
  assert.throws(() => api.parse(JSON.stringify({ type: 'FeatureCollection', features: [] })), /地物/);
});
test('empty and unsupported geometries, non-numeric and projected coordinates are rejected', () => {
  for (const geometry of [null, { type: 'GeometryCollection', geometries: [point.geometry] }, { type: 'Point', coordinates: ['139',36] }, { type: 'Point', coordinates: [100000,300000] }, { type: 'LineString', coordinates: [[139,36]] }]) {
    assert.throws(() => api.parse(JSON.stringify({ ...point, geometry })));
  }
  assert.throws(() => api.parse(JSON.stringify({ ...source, crs: { properties: { name: 'EPSG:3857' } } })), /座標系/);
});
test('unclosed rings are rejected without automatically changing coordinates', () => {
  const invalid = structuredClone(polygon);
  invalid.geometry.coordinates[0][3] = [139.471,36.12];
  assert.throws(() => api.parse(JSON.stringify(invalid)), /始点と終点/);
});
test('mapping cannot silently truncate long attributes or accept malformed metadata', () => {
  assert.throws(() => prepare({ ...point, properties: { 名称: 'x'.repeat(101) } }), /名称/);
  const invalid = prepare(point);
  invalid.features[0].gyoda.color = 'url(javascript:alert(1))';
  assert.throws(() => api.exportText(invalid), /表示色/);
});
test('limits and unknown draft versions fail explicitly', () => {
  assert.throws(() => api.parse(' '.repeat(api.MAX_BYTES + 1)), /5MB/);
  assert.throws(() => api.normalize({ ...source, features: Array(1001).fill(point) }), /地物/);
  assert.throws(() => api.parse(JSON.stringify({ ...source, gyodaEditorVersion: 2 })), /バージョン/);
});
test('empty local drafts can be saved and validated', () => {
  const saved = JSON.parse(api.exportText(empty()));
  assert.deepEqual(api.validateDraft(saved).features, []);
});
test('null properties and attribute text do not evaluate HTML', () => {
  const object = { ...point, properties: { 名称: '<img src=x onerror=alert(1)>', value: false } };
  assert.equal(prepare(object).features[0].gyoda.name, object.properties.名称);
  assert.equal(api.propertyText(object, 'value'), 'false');
  assert.equal(prepare({ ...point, properties: null }).features[0].gyoda.name, '点 1');
});
