// Runs the tool adapters in plain node on fake query results shaped like the real
// querySpot / queryCell output, so the reshaping and the dispatch can be checked
// without Electron or a database.
const assert = require('assert');
const tools = require('./tools');

// ---- a spot, shaped like querySpot's result
const spotRes = {
  success: true, spotId: 1642419, geneName: 'Synpr', x: 5506, y: 772, z: 152,
  neighborLabels: ['Cell 18223', 'Cell 21574', 'Cell 17371', 'Misread'],
  neighborIds: [18223, 21574, 17371],
  neighborClasses: ['037 DG Glut', '037 DG Glut', '037 DG Glut'],
  mvn: [-10.4, -12.8, -12.1], attention: [0.94, 0.94, 0.94], exprFluct: [0.18, 0.07, -0.54],
  cellInefficiency: [-0.66, 0.10, -0.30], geneInefficiency: [-0.65, -0.65, -0.65], bonus: null,
  misread: -14.9, scores: [-10.59, -12.35, -12.62, -14.9], probabilities: [0.737, 0.127, 0.097, 0.01],
};
const spot = tools.spotToDict(spotRes);
assert.strictEqual(spot.assigned_to, 18223);
assert.strictEqual(spot.candidates[0].class, '037 DG Glut');
assert.strictEqual(spot.candidates[3].cell, 'background');
assert.ok(spot.narrative.startsWith('Spot 1642419 is a Synpr spot. It was assigned to cell 18223'));
assert.ok(/distance carries the call/.test(spot.narrative));
assert.ok(!/\bnats?\b/.test(spot.narrative));

// ---- a cell, shaped like queryCell's result, class C is the runner up
const names = ['A', 'B', 'C'];
const calls = [];
function fakeQueryCell(label, userClass) {
  calls.push(userClass);
  const o = names.indexOf(userClass);
  return {
    success: true, cellId: label, assignedClass: 'B', userClass,
    classNames: names, classProb: [0.01, 0.9, 0.09], posterior: null,
    components: { geneLoglikAssigned: -100, geneLoglikUser: -120 - o,
                  logPriorAssigned: -1.1, logPriorUser: -1.1, mrfAssigned: 3.0, mrfUser: 0.2 },
    topData: [{ gene: 'Ndnf', diff: 9.0, geneCount: 8 }, { gene: 'Rgs5', diff: 4.0, geneCount: 5 }],
    bottomData: [{ gene: 'Npy', diff: -2.0, geneCount: 3 }],
  };
}
let sent = [];
tools.init({ querySpot: async () => spotRes, queryCell: async (l, u) => fakeQueryCell(l, u),
             getMeta: () => ({ class_names: names }), send: (ch, p) => sent.push([ch, p]) });

(async () => {
  const cell = await tools.call('explain_cell', { label: 42 });
  assert.deepStrictEqual(calls, ['A', 'C'], 'first query with any class, second with the runner up');
  assert.strictEqual(cell.compared_with, 'C');
  assert.strictEqual(cell.prob_assigned, 0.9);
  assert.deepStrictEqual(cell.genes_favouring_assigned.map(g => g.gene), ['Ndnf', 'Rgs5']);
  assert.ok(cell.narrative.startsWith('Cell 42 was called B, with probability 0.90'));
  assert.ok(/So the genes settled it/.test(cell.narrative));

  const same = await tools.call('explain_cell', { label: 42, vs_class: 'B' });
  assert.ok(/already B/.test(same.error));

  const fly = await tools.call('fly_to_cell', { label: 18223 });
  assert.deepStrictEqual(sent, [['chat-fly-to-cell', { label: 18223 }]]);
  assert.strictEqual(fly.done, true);

  const viaCall = await tools.call('explain_spot', { spot_id: 1642419 });
  assert.strictEqual(viaCall.assigned_to, 18223);

  const bad = await tools.call('no_such_tool', {});
  assert.ok(/unknown tool/.test(bad.error));
  console.log('tools.check: all assertions pass');
})().catch(e => { console.error('tools.check FAILED:', e.message); process.exit(1); });
