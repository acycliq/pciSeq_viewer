// Checks the annotations file format on its own: node electron/annotations.check.js
const assert = require('assert');
const { toGeoJSON, fromGeoJSON, readFiles } = require('./annotations');

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

// Open: region CSVs come back as text for the renderer to parse, one annotations
// file comes back as regions, and the two cannot be mixed
const fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pciseq-ann-'));
const csvA = path.join(dir, 'ca1.csv'), csvB = path.join(dir, 'DG.CSV'), gjFile = path.join(dir, 'a.geojson');
fs.writeFileSync(csvA, 'x,y\n0,0\n1,0\n1,1\n');
fs.writeFileSync(csvB, 'x,y\n5,5\n6,5\n6,6\n');
fs.writeFileSync(gjFile, JSON.stringify(gj));
assert.deepStrictEqual(readFiles([csvA, csvB]).csv.map(c => c.name), ['ca1.csv', 'DG.CSV']);
assert.ok(readFiles([csvA]).csv[0].text.startsWith('x,y'));
const opened = readFiles([gjFile]);
assert.strictEqual(opened.file, gjFile);
assert.strictEqual(opened.regions.length, 2);
assert.throws(() => readFiles([gjFile, csvA]), /one annotations file, or one or more region CSV/);
fs.rmSync(dir, { recursive: true, force: true });

console.log('annotations.check: all assertions pass');
