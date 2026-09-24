// Prints the narratives for fixed inputs, so they can be diffed against the Python
// ones (pciSeq/src/mcp/tools.py) on the same inputs. Run from the pciSeq_3d repo:
//   node electron/narrative.check.js > js.txt; python ... > py.txt; diff js.txt py.txt
const { narrateCell, narrateSpot, strength } = require('./narrative');

const cellGenes = {
  cell: 1, assigned: 'A', compared_with: 'B', prob_assigned: 1.0, prob_compared: 0.0,
  score: { gene_loglik: { assigned: -100.0, compared: -133.6 },
           log_prior: { assigned: -4.3, compared: -4.3 },
           spatial: { assigned: 4.8, compared: 0.0 } },
  genes_favouring_assigned: [{ gene: 'Ndnf', counts: 8.0, diff: 15.3 }, { gene: 'Rgs5', counts: 7.0, diff: 15.3 }],
  genes_favouring_compared: [{ gene: 'Npy', counts: 3.0, diff: -7.6 }],
};
const cellOverrule = {
  cell: 4308, assigned: 'L5 ET', compared_with: 'L4/5 IT', prob_assigned: 0.999, prob_compared: 0.001,
  score: { gene_loglik: { assigned: -300.0, compared: -296.0 },
           log_prior: { assigned: -4.3, compared: -4.3 },
           spatial: { assigned: 12.5, compared: 0.5 } },
  genes_favouring_assigned: [{ gene: 'Cpne7', counts: 9.0, diff: 8.2 }],
  genes_favouring_compared: [{ gene: 'Car4', counts: 6.0, diff: -7.2 }],
};
function spot(assigned, cands, bgProb, bgMisread = -14.0) {
  const rows = cands.map(([cell, cls, gauss, cx, sc, cg, prob]) => ({
    cell, class: cls, 'Gaussian fit': gauss, 'class expression': cx, 'cell scale': sc,
    'cell-gene scale': cg, 'gene efficiency': -0.35, bonus: 0.0, sum: gauss + cx + sc + cg - 0.35, prob }));
  rows.push({ cell: 'background', misread: bgMisread, sum: bgMisread, prob: bgProb });
  return { spot: 7, gene: 'Synpr', position: {}, candidates: rows, assigned_to: assigned };
}
const spotDistance = spot(18223, [[18223, 'DG', -10.4, 0.94, -0.66, 0.18, 0.74],
                                  [21574, 'DG', -12.8, 0.94, 0.10, 0.07, 0.13],
                                  [17371, 'DG', -12.1, 0.94, -0.30, -0.54, 0.10]], 0.01);
const spotExpression = spot(2, [[2, 'CA2', -11.0, 0.9, 0.5, 0.6, 0.66],
                                [1, 'CA1', -10.6, -1.2, 0.0, 0.0, 0.32]], 0.01);
const spotBackground = spot('background', [[6482, 'VLMC', -15.6, -1.3, 0.6, -0.36, 0.02]], 0.95);

console.log('strength ' + [0.2, 0.8, 2.0, 4.1, 8.4, 12.5, 33.6].map(strength).join(' | '));
console.log('cellGenes ' + narrateCell(cellGenes));
console.log('cellOverrule ' + narrateCell(cellOverrule));
console.log('spotDistance ' + narrateSpot(spotDistance));
console.log('spotExpression ' + narrateSpot(spotExpression));
console.log('spotBackground ' + narrateSpot(spotBackground));
