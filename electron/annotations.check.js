// Checks the annotations file format on its own: node electron/annotations.check.js
const assert = require('assert');
const { toGeoJSON, fromGeoJSON } = require('./annotations');

const regions = [
  { name: 'CA1', boundaries: [[0, 0], [10, 0], [10, 5]], visible: true, by: 'you' },
  { name: 'Vip cluster', boundaries: [[1, 1], [2, 1], [2, 2], [1, 1]], visible: false, by: 'chat' },
];
const gj = toGeoJSON(regions);
assert.strictEqual(gj.type, 'FeatureCollection');
assert.deepStrictEqual(gj.features[0].geometry.coordinates[0], [[0, 0], [10, 0], [10, 5], [0, 0]], 'ring closed');
assert.strictEqual(gj.features[1].geometry.coordinates[0].length, 4, 'an already closed ring is not closed twice');

// round trip through text, as Save then Open does
const back = fromGeoJSON(JSON.parse(JSON.stringify(gj)));
assert.strictEqual(back.skipped, 0);
assert.deepStrictEqual(back.regions[0], regions[0]);
assert.deepStrictEqual(back.regions[1], { ...regions[1], boundaries: [[1, 1], [2, 1], [2, 2]] });

// GeoJSON from elsewhere: no name, a QuPath style classification, a point to skip
const other = fromGeoJSON({ type: 'FeatureCollection', features: [
  { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
  { type: 'Feature', properties: { classification: { name: 'Tumor' } },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2]]] } },
  { type: 'Feature', properties: { name: 'dot' }, geometry: { type: 'Point', coordinates: [3, 3] } },
] });
assert.deepStrictEqual(other.regions.map(r => [r.name, r.by, r.visible]), [['Region 1', 'you', true], ['Tumor', 'you', true]]);
assert.strictEqual(other.skipped, 1);

// a cell annotation keeps its labels, no geometry
const cells = { name: 'Sncg near CA1', kind: 'cells', labels: [12, 40], visible: true, by: 'chat' };
const cg = toGeoJSON([cells]);
assert.strictEqual(cg.features[0].geometry, null);
assert.deepStrictEqual(fromGeoJSON(JSON.parse(JSON.stringify(cg))).regions, [cells]);

// regions fitted from the Allen atlas keep their maker
const allen = fromGeoJSON({ type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { name: 'Allen CA3', by: 'allen' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] } }] });
assert.strictEqual(allen.regions[0].by, 'allen');

assert.throws(() => fromGeoJSON({ type: 'Feature' }), /not a GeoJSON FeatureCollection/);

console.log('annotations.check: all assertions pass');
