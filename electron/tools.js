// The tools the chat panel's model can call, and what they do.
//
// Same idea as pciSeq/src/mcp/tools.py on the Python side: the model gets a list
// of tools with descriptions, decides which to call, and gets an object back.
// The numbers come from querySpot and queryCell in diagnostics.js, which the
// Spot Inspector and Cell Inspector already use; this file reshapes their result
// into the dict the narrators expect and adds the story. Two tools act on the
// screen as well as answering, moving the map and opening the cell diagnostics
// panel, which is the one thing the viewer can do that the Python server cannot.
//
// Dependencies come in through init() rather than require(), so the adapters can
// be run in plain node with fake query results (tools.check.js).

const { narrateCell, narrateSpot } = require('./narrative');

let deps = { querySpot: null, queryCell: null, getMeta: null, send: null };

function init(d) {
  deps = { ...deps, ...d };
}

// What the model reads. Anthropic tool schema shape.
const TOOLS = [
  {
    name: 'explain_spot',
    description:
      'Why a spot was assigned to the cell it was. One row per candidate cell plus the ' +
      'background, with the Gaussian fit to the cell centre, the class expression term, ' +
      'the cell scale, the cell-gene scale, the gene efficiency and the resulting ' +
      'probability, and a narrative that tells the story in plain words with the ' +
      'evidence as odds. A spot can sit outside every cell and still go to one, because ' +
      'position is scored against the centroid, not the mask. spot_id is the id shown in ' +
      'the viewer.',
    input_schema: {
      type: 'object',
      properties: { spot_id: { type: 'integer', description: 'The spot id.' } },
      required: ['spot_id'],
    },
  },
  {
    name: 'explain_cell',
    description:
      'Why a cell was given its class, gene by gene. Compares the assigned class ' +
      'against another, the runner up unless vs_class is given: the gene ' +
      'log-likelihood, the class prior and the spatial term for each, the genes that ' +
      'pushed hardest for each side with the cell\'s count and what a cell of either ' +
      'class typically holds, and a narrative in plain words. A gene the cell lacks can ' +
      'count against the class that expresses it. Counts are soft, weighted by ' +
      'assignment probability. label is the cell number shown in the viewer.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'integer', description: 'The cell label, as in the segmentation.' },
        vs_class: { type: 'string', description: 'Class to compare against. Defaults to the runner up.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'open_cell_diagnostics',
    description:
      'Open the cell diagnostics panel on a cell, compared against the runner up (or ' +
      'vs_class), so the user sees the charts and tables behind the call. Returns the ' +
      'same numbers as explain_cell. Use it when the user asks to see the diagnostics; ' +
      'after explaining a cell, offer it rather than opening it unasked. When the cell ' +
      'has no runner up (the assigned class holds all the probability) it returns an ' +
      'error asking for vs_class; ask the user which class to compare against instead ' +
      'of guessing.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'integer', description: 'The cell label, as in the segmentation.' },
        vs_class: { type: 'string', description: 'Class to compare against. Defaults to the runner up.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'fly_to_cell',
    description:
      'Move the map to a cell and flash its outline, so the user can see the cell ' +
      'being talked about. Use it when the user asks to see or show a cell; after ' +
      'explaining one, offer it rather than calling it unasked. label is the cell ' +
      'number shown in the viewer.',
    input_schema: {
      type: 'object',
      properties: { label: { type: 'integer', description: 'The cell label.' } },
      required: ['label'],
    },
  },
];

// ---------------------------------------------------------------- adapters

// querySpot result -> the dict narrateSpot expects, the same shape as the Python
// explain_spot returns.
function spotToDict(res) {
  const n = res.mvn.length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      cell: res.neighborIds[i],
      class: res.neighborClasses ? res.neighborClasses[i] : null,
      'Gaussian fit': res.mvn[i],
      'class expression': res.attention[i],
      'cell scale': res.cellInefficiency ? res.cellInefficiency[i] : 0,
      'cell-gene scale': res.exprFluct[i],
      'gene efficiency': res.geneInefficiency ? res.geneInefficiency[i] : 0,
      bonus: res.bonus ? res.bonus[i] : 0,
      sum: res.scores[i],
      prob: res.probabilities[i],
    });
  }
  rows.push({ cell: 'background', misread: res.misread, sum: res.scores[n], prob: res.probabilities[n] });
  let best = 0;
  for (let i = 1; i <= n; i++) if (res.probabilities[i] > res.probabilities[best]) best = i;
  const out = {
    spot: res.spotId,
    gene: res.geneName,
    position: { x: res.x, y: res.y, z: res.z,
                z_is: 'the anisotropy scaled z the model works in, not the plane index' },
    candidates: rows,
    assigned_to: best === n ? 'background' : res.neighborIds[best],
  };
  out.narrative = narrateSpot(out);
  return out;
}

// one gene of the top or bottom list. The two means are the average count over the
// cells this run called each class, the Gene Expression table of the diagnostics.
const geneRow = g => ({ gene: g.gene, counts: g.geneCount, mean_in_assigned: g.meanAssigned,
                        mean_in_compared: g.meanUser, diff: g.diff });

// queryCell result -> the dict narrateCell expects, the same shape as the Python
// explain_cell returns.
function cellToDict(res, label) {
  const names = res.classNames;
  const a = names.indexOf(res.assignedClass);
  const o = names.indexOf(res.userClass);
  const c = res.components;
  const forA = res.topData.filter(g => g.diff > 0).map(geneRow);
  const forO = res.bottomData.filter(g => g.diff < 0).map(geneRow);
  const out = {
    cell: label,
    assigned: res.assignedClass,
    compared_with: res.userClass,
    prob_assigned: res.classProb[a],
    prob_compared: res.classProb[o],
    score: {
      gene_loglik: { assigned: c.geneLoglikAssigned, compared: c.geneLoglikUser },
      log_prior: { assigned: c.logPriorAssigned ?? 0, compared: c.logPriorUser ?? 0 },
      spatial: { assigned: c.mrfAssigned ?? 0, compared: c.mrfUser ?? 0 },
    },
    genes_favouring_assigned: forA,
    genes_favouring_compared: forO,
    // the totals of the two lists, the sums in the chart titles of the cell
    // diagnostics. Given so the model quotes them rather than adds up the diffs
    // itself, which it does badly.
    sum_favouring_assigned: forA.reduce((s, g) => s + g.diff, 0),
    sum_favouring_compared: forO.reduce((s, g) => s + g.diff, 0),
    counts_are: 'soft, weighted by the spot assignment probabilities',
    means_are: 'the average count over the cells of this run, each weighted by its probability of ' +
      'being that class. An after the fact summary of the run, not the scRNAseq profile the ' +
      'likelihood scores against',
  };
  if (c.mrfAssigned == null) {
    out.note = 'this run carries no spatial term in diagnostics.db, so it is taken as zero';
  }
  out.narrative = narrateCell(out);
  return out;
}

// The runner up: the class with the second largest stored probability.
function runnerUp(res) {
  const a = res.classNames.indexOf(res.assignedClass);
  let best = -1;
  for (let k = 0; k < res.classProb.length; k++) {
    if (k === a) continue;
    if (best === -1 || res.classProb[k] > res.classProb[best]) best = k;
  }
  return res.classNames[best];
}

// A runner up with no probability at three decimals, the precision of cellData.tsv,
// is no runner up: the assigned class holds everything and the comparison is
// arbitrary. The tool then asks the user for a class rather than picking one.
const NO_RUNNER_UP = 0.0005;

// The query behind explain_cell and open_cell_diagnostics: the cell against the
// runner up, or against vs_class. queryCell needs a class to compare against, and
// the runner up is not known until a first query hands back the probabilities. So
// query once with any class, pick the runner up from the result, and query again
// if it differs. Resolves to { res } or { error }.
async function cellQuery(label, vsClass, needRunnerUp) {
  const meta = deps.getMeta();
  let res = await deps.queryCell(label, vsClass || meta.class_names[0]);
  if (!res.success) return { error: res.error };
  if (vsClass) {
    if (vsClass === res.assignedClass) {
      return { error: `cell ${label} is already ${res.assignedClass}, pick another class to compare` };
    }
    return { res };
  }
  const other = runnerUp(res);
  if (needRunnerUp && res.classProb[res.classNames.indexOf(other)] < NO_RUNNER_UP) {
    return { error: `cell ${label} is ${res.assignedClass} with all the probability, there is ` +
                    'no runner up to compare against. Ask the user which class to compare ' +
                    'against and call again with vs_class' };
  }
  if (other !== res.userClass) {
    res = await deps.queryCell(label, other);
    if (!res.success) return { error: res.error };
  }
  return { res };
}

// ---------------------------------------------------------------- dispatch

// Returns the tool's answer as an object. Errors come back as { error } so the
// model can read them and tell the user, rather than as exceptions.
async function call(name, input) {
  try {
    if (name === 'explain_spot') {
      const res = await deps.querySpot(Number(input.spot_id));
      if (!res.success) return { error: res.error };
      return spotToDict(res);
    }
    if (name === 'explain_cell') {
      const label = Number(input.label);
      const { res, error } = await cellQuery(label, input.vs_class, false);
      if (error) return { error };
      return cellToDict(res, label);
    }
    if (name === 'open_cell_diagnostics') {
      const label = Number(input.label);
      const { res, error } = await cellQuery(label, input.vs_class, true);
      if (error) return { error };
      deps.send('chat-open-cell-diagnostics', { label, vs_class: res.userClass });
      const out = cellToDict(res, label);
      out.diagnostics = `open on cell ${label}, ${res.assignedClass} against ${res.userClass}, ` +
                        'Genes tab first';
      return out;
    }
    if (name === 'fly_to_cell') {
      const label = Number(input.label);
      deps.send('chat-fly-to-cell', { label });
      return { done: true, cell: label, note: 'the map is moving to the cell' };
    }
    return { error: `unknown tool ${name}` };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { init, TOOLS, call, spotToDict, cellToDict, runnerUp };
