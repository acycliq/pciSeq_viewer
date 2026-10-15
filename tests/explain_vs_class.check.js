// explain_cell against a class that is not the runner up. The run saves the per gene
// numbers for the runner up only, so for any other class run.js rebuilds them, and
// shows them only when they add up to the gene score the run saved. The expected
// numbers here were worked out by the python tools' _nb_contributions on the same
// made up cell, so this also checks the two sides agree.

const { test } = require('node:test');
const assert = require('assert');
const run = require('../electron/run');

const f32b = a => Buffer.from(new Float32Array(a).buffer);
// two genes, three classes; the cell is A, the runner up B, and C is asked about
const SAVED = [-5.564148902893066, -11.620928764343262, -6.398601531982422];
const META = {
  class_names: ['A', 'B', 'C'], gene_panel: ['G1', 'G2'],
  eta_bar: [1.2, 0.8], SpotReg: 0.1, rSpot: 2, log_prior: [-1, -1, -1],
  mean_expression_adj: [[3.0, 0.2, 1.0], [0.1, 4.0, 1.0]],
  mean_gene_reads_per_class: [[3, 0, 1], [0, 4, 1]], label_map: {},
};
// the model's own per gene numbers of the assigned class A, saved by the run
const SAVED_A = [-4.21268892288208, -1.3514597415924072];
function cellRow(saved, savedA = SAVED_A) {
  return {
    internal_label: 1, assigned_class_idx: 0, runner_up_idx: 1, area_factor: 1.5,
    theta_bar: f32b([1.1, 0.9, 1.0]), gene_count: f32b([5.0, 0.5]),
    class_prob: f32b([0.9, 0.08, 0.02]), gene_loglik: f32b(saved), mrf: f32b([0, 0, 0]),
    contr_assigned: f32b(savedA), contr_runner_up: f32b([0, 0]),
    scored_gene_count: f32b([5.0, 0.5]),
  };
}
function useRow(row) {
  run.init({
    getMeta: () => META, getCellKey: () => 'internal_label',
    getDb: () => ({ prepare: q => ({
      get: () => row,
      all: () => /table_info/.test(q) ? Object.keys(row).map(name => ({ name })) : [],
    }) }),
  });
}

test('against a class that is not the runner up the genes are rebuilt, as python does', () => {
  useRow(cellRow(SAVED));
  const e = run.explainCell(1, 'C');
  assert.ok(!e.detail_note, e.detail_note);
  const g1 = e.genes_favouring_assigned.find(g => g.gene === 'G1');
  const g2 = e.genes_favouring_assigned.find(g => g.gene === 'G2');
  assert.ok(Math.abs(g1.diff - 0.7185831069946289) < 1e-5, g1.diff);
  assert.ok(Math.abs(g2.diff - 0.11586976051330566) < 1e-5, g2.diff);
});

test('the rebuild is refused when it does not add up to the saved score', () => {
  // the run's own gene score for C made different, as an older or changed model would
  useRow(cellRow([SAVED[0], SAVED[1], SAVED[2] - 3]));
  const e = run.explainCell(1, 'C');
  assert.deepStrictEqual(e.genes_favouring_assigned, []);
  assert.ok(/could not be rebuilt to match/.test(e.detail_note), e.detail_note);
});

test('the rebuild is refused when one gene of the assigned class does not match', () => {
  // the total still matches, so only the gene by gene check can catch it: a model
  // change that moves score between genes and keeps the sum
  useRow(cellRow(SAVED, [SAVED_A[0] + 0.5, SAVED_A[1] - 0.5]));
  const e = run.explainCell(1, 'C');
  assert.deepStrictEqual(e.genes_favouring_assigned, []);
  assert.ok(/could not be rebuilt to match/.test(e.detail_note), e.detail_note);
});
