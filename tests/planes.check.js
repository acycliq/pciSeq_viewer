// The scaled z to plane rule, on both sides of the viewer: utils/planes.js for the
// page and planeOfZ in electron/run.js for the main process. The cases are the same
// as PLANE_CASES in pciSeq_3d tests/test_geometry.py, where the rule comes from; if
// one side changes the rule the other still holds the old numbers, so change both.

const { test } = require('node:test');
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const run = require('../electron/run');

// [voxel_size, scaled z, plane]
const CASES = [
  [[0.28, 0.28, 0.7], 0.0, 0],
  [[0.28, 0.28, 0.7], 2.875, 1],     // spot 2293181 on espio_demo, plane_id 1
  [[0.28, 0.28, 0.7], 52.49, 20],    // just below plane 21
  [[0.28, 0.28, 0.7], 52.5, 21],     // exactly on plane 21
  [[0.28, 0.28, 0.7], 53.91, 21],    // plane 21.56, floor not round
  [[1, 1, 1], 0.9998, 0],            // outside the 1e-4 tolerance, still 0
  [[1, 1, 1], 0.99995, 1],           // inside it, taken as on plane 1
  [[1, 1, 1], 7.5, 7],
];

test('the page and the main process put a z on the same plane as pciSeq', async () => {
  const page = await import(pathToFileURL(path.join(__dirname, '..', 'utils', 'planes.js')).href);
  for (const [voxel, z, plane] of CASES) {
    assert.strictEqual(page.planeOf(z, voxel), plane, `page: z ${z} with ${voxel}`);
    assert.strictEqual(run.planeOfZ(z, voxel), plane, `main: z ${z} with ${voxel}`);
  }
});

test('the start of every plane comes back to that plane', async () => {
  const page = await import(pathToFileURL(path.join(__dirname, '..', 'utils', 'planes.js')).href);
  for (const voxel of [[0.28, 0.28, 0.7], [0.147, 0.147, 0.9]]) {
    for (let p = 0; p < 100; p++) {
      const z = page.planeToZ(p, voxel);
      assert.strictEqual(page.planeOf(z, voxel), p);
      assert.strictEqual(run.planeOfZ(z, voxel), p);
    }
  }
});
