// The tools the chat panel's model can call, and what they do.
//
// Same idea as pciSeq/src/mcp/tools.py on the Python side: the model gets a list
// of tools with descriptions, decides which to call, and gets an object back.
// The numbers come from querySpot and queryCell in diagnostics.js, which the
// Spot Inspector and Cell Inspector already use; this file reshapes their result
// into the dict the narrators expect and adds the story. Two tools act on the
// map instead of answering, which is the one thing the viewer can do that the
// Python server cannot.
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
      'pushed hardest for each side, and a narrative in plain words. Counts are soft, ' +
      'weighted by assignment probability. label is the cell number shown in the viewer.',
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
      'being talked about. Use it when the user asks to see or show a cell, or after ' +
      'explaining one. label is the cell number shown in the viewer.',
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

// queryCell result -> the dict narrateCell expects, the same shape as the Python
// explain_cell returns.
function cellToDict(res, label) {
  const names = res.classNames;
  const a = names.indexOf(res.assignedClass);
  const o = names.indexOf(res.userClass);
  const c = res.components;
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
    genes_favouring_assigned: res.topData.filter(g => g.diff > 0)
      .map(g => ({ gene: g.gene, counts: g.geneCount, diff: g.diff })),
    genes_favouring_compared: res.bottomData.filter(g => g.diff < 0)
      .map(g => ({ gene: g.gene, counts: g.geneCount, diff: g.diff })),
    counts_are: 'soft, weighted by the spot assignment probabilities',
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
      // queryCell needs a class to compare against, and the runner up is not known
      // until a first query hands back the probabilities. So query once with any
      // class, pick the runner up from the result, and query again if it differs.
      const meta = deps.getMeta();
      let res = await deps.queryCell(label, input.vs_class || meta.class_names[0]);
      if (!res.success) return { error: res.error };
      if (!input.vs_class) {
        const other = runnerUp(res);
        if (other !== res.userClass) {
          res = await deps.queryCell(label, other);
          if (!res.success) return { error: res.error };
        }
      } else if (input.vs_class === res.assignedClass) {
        return { error: `cell ${label} is already ${res.assignedClass}, pick another class to compare` };
      }
      return cellToDict(res, label);
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
