// The run tools, ported from pciSeq/src/mcp/tools.py, reading only.
//
// Everything comes out of diagnostics.db and its metadata; nothing is recomputed
// with today's formulas, so a run answered here in a year is answered with its own
// numbers (bead cz1.9). The Python side is the reference until it is retired: a
// field here means what the same field means there, and the check script compares
// the two on a real run.
//
// Three rules, the same as the Python file:
//   1. cell labels in and out are the labels of the segmentation, never internal.
//   2. counts are soft, weighted by assignment probability, and every answer that
//      reports one says so.
//   3. row 0 of the cells table is the background pseudocell, never reported.
//
// Dependencies come in through init() so run.check.js can drive it in plain node
// with a database and no Electron.

const { narrateCell } = require('./narrative');

let deps = { getDb: null, getMeta: null, getCellKey: null, querySpot: null };

// caches per open database, dropped when the db handle changes
let cache = { db: null };

// counts below this are dropped from per gene listings, as in the Python tools
const COUNT_TOL = 0.001;

function init(d) {
  deps = { ...deps, ...d };
}

function db() {
  const d = deps.getDb();
  if (!d) throw new Error('no diagnostics.db is open');
  if (cache.db !== d) cache = { db: d };
  return d;
}

function meta() {
  // a new metadata object means another run was loaded: drop what was derived
  // from the old one, or toExternal would translate with the old label map
  const m = deps.getMeta() || {};
  if (cache.metaRef !== m) {
    cache.metaRef = m;
    delete cache.reverseMap;
  }
  return m;
}

function cfg() {
  const c = meta().config;
  return (c && typeof c === 'object') ? c : null;
}

// ---------------------------------------------------------------- labels

// label_map arrives parsed from the metadata table, original label (string key)
// to internal, or null when the segmentation was already sequential
function toInternal(label) {
  const n = Number(label);
  if (!Number.isInteger(n)) {
    throw new Error(`${label} is not a cell label. Spots assigned to the background ` +
                    'belong to no cell, so there is nothing to look up.');
  }
  const lm = meta().label_map;
  if (!lm || Object.keys(lm).length === 0) return n;
  const row = lm[String(n)];
  if (row === undefined) throw new Error(`no cell ${n} in this segmentation`);
  return row;
}

function toExternal(row) {
  const lm = meta().label_map;
  if (!lm || Object.keys(lm).length === 0) return Number(row);
  if (!cache.reverseMap) {
    cache.reverseMap = new Map(Object.entries(lm).map(([k, v]) => [v, Number(k)]));
  }
  const lab = cache.reverseMap.get(Number(row));
  if (lab === undefined) throw new Error(`no cell at row ${row}`);
  return lab;
}

// ---------------------------------------------------------------- plumbing

const f32 = b => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
const i32 = b => new Int32Array(b.buffer, b.byteOffset, b.byteLength / 4);

function cellColumns() {
  // db() first, on its own line: it replaces `cache` when the database changed,
  // and in `cache.x = f(db())` the assignment target is resolved BEFORE db() runs,
  // so the value would land on the discarded cache object (that exact bug made
  // hasSavedScore false on its first call)
  const h = db();
  if (!cache.cellCols) {
    cache.cellCols = new Set(h.prepare('PRAGMA table_info(cells)').all().map(r => r.name));
  }
  return cache.cellCols;
}

// every array of one cell, keyed by column name, taking a segmentation label
function cellRow(label) {
  const row = toInternal(label);
  if (row === 0) throw new Error('cell 0 is the background pseudocell, not a cell');
  const got = db().prepare(`SELECT * FROM cells WHERE ${deps.getCellKey()} = ?`).get(row);
  if (!got) throw new Error(`cell ${label} is not in diagnostics.db`);
  const out = {
    row,
    theta: got.theta,
    assigned_class_idx: got.assigned_class_idx,
    class_prob: f32(got.class_prob),
    gene_count: f32(got.gene_count),
    theta_bar: f32(got.theta_bar),
    gamma_assigned: f32(got.gamma_assigned),
    mrf: got.mrf ? f32(got.mrf) : null,
    neighbours: got.neighbours ? i32(got.neighbours) : null,
    x: got.x, y: got.y, z: got.z,
  };
  return out;
}

// every cell's class probabilities, gene counts, assigned class and centroid,
// read once and kept. Internal order, the background row left out.
function allCells() {
  if (!cache.scan) {
    const key = deps.getCellKey();
    const hasXYZ = cellColumns().has('x');
    const rows = db().prepare(
      `SELECT ${key} AS k, class_prob, gene_count, assigned_class_idx` +
      (hasXYZ ? ', x, y, z' : '') +
      ` FROM cells WHERE ${key} > 0 ORDER BY ${key}`).all();
    cache.scan = rows.map(r => ({
      internal: r.k,
      class_prob: f32(r.class_prob),
      gene_count: f32(r.gene_count),
      total: f32(r.gene_count).reduce((s, v) => s + v, 0),
      assigned: r.assigned_class_idx,
      x: r.x, y: r.y, z: r.z,
    }));
  }
  return cache.scan;
}

function geneIndex(name) {
  const g = meta().gene_panel.indexOf(name);
  if (g < 0) throw new Error(`no gene '${name}' in this run`);
  return g;
}

function classIndex(name) {
  const k = meta().class_names.indexOf(name);
  if (k < 0) throw new Error(`no class '${name}' in this run`);
  return k;
}

// the plane a scaled z falls on: floor, as pciSeq gives a spot its plane_id, with
// the same tiny tolerance as the Python _plane_of. null without voxel_size
function planeOf(z) {
  const c = cfg();
  if (!c || !c.voxel_size) return null;
  const [vx, , vz] = c.voxel_size;
  return Math.floor(z * vx / vz + 1e-4);
}

// the top classes of one cell by probability, as [k, prob] pairs
function topClasses(c, n) {
  return Array.from(c.class_prob, (p, k) => [k, p])
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, n);
}

// ------------------------------------------------------------------ tools

function cell(label) {
  const names = meta().class_names;
  const panel = meta().gene_panel;
  const c = cellRow(label);
  const counts = c.gene_count;
  const top = Array.from(counts, (v, g) => [g, v])
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 10);
  return {
    cell: Number(label),
    total_counts: counts.reduce((s, v) => s + v, 0),
    counts_are: 'soft, weighted by the spot assignment probabilities',
    classes: topClasses(c, 5).map(([k, p]) => ({ class: names[k], prob: p })),
    top_genes: top.filter(([, v]) => v > COUNT_TOL)
      .map(([g, v]) => ({ gene: panel[g], counts: v })),
    theta: c.theta,
    theta_is: 'the soft scalar, averaged over the class probabilities, ' +
              'not theta_bar of the assigned class',
    neighbours: c.neighbours ? Array.from(c.neighbours, r => toExternal(r)) : null,
    neighbours_are: 'the cells the spatial (mrf) term listens to, nearest first',
  };
}

function cellCounts(label, gene) {
  const panel = meta().gene_panel;
  const c = cellRow(label);
  const counts = c.gene_count;
  const note = 'these are soft counts: each spot contributes its probability of ' +
               'belonging to this cell, so they are estimates and not whole numbers';
  if (gene != null) {
    const g = panel.indexOf(gene);
    if (g < 0) throw new Error(`no gene '${gene}' in the panel`);
    return { cell: Number(label), gene, counts: counts[g], counts_are: note };
  }
  const order = Array.from(counts, (v, g) => [g, v]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return {
    cell: Number(label),
    total_counts: counts.reduce((s, v) => s + v, 0),
    per_gene: order.filter(([, v]) => v > COUNT_TOL)
      .map(([g, v]) => ({ gene: panel[g], counts: v })),
    counts_are: note,
  };
}

function theta(label) {
  const names = meta().class_names;
  const c = cellRow(label);
  return {
    cell: Number(label),
    theta: c.theta,
    theta_is: 'the scale factor averaged over the class probabilities, the ' +
              'value the outputs report',
    theta_bar_per_class: topClasses(c, 5).map(([k, p]) => ({
      class: names[k], theta_bar: c.theta_bar[k], prob: p })),
    theta_bar_is: "the posterior mean of theta under each class: the factor " +
                  "scaling that class's expected counts to the cell's total. " +
                  'Gamma(rTheta, rTheta) prior, mean 1',
    rTheta: (cfg() || {}).rTheta ?? null,
  };
}

function gamma(label, gene) {
  const names = meta().class_names;
  const panel = meta().gene_panel;
  const c = cellRow(label);
  const out = {
    cell: Number(label),
    class: names[c.assigned_class_idx],
    gamma_is: 'gamma_bar, the posterior mean of the per cell, per gene scale that ' +
              'absorbs overdispersion, under the assigned class only. ' +
              'diagnostics.db does not keep the (cell, gene, class) array, so ' +
              'gamma under another class is not available',
  };
  if (gene != null) {
    const g = geneIndex(gene);
    out.gene = gene;
    out.gamma = c.gamma_assigned[g];
    out.counts = c.gene_count[g];
  } else {
    out.gamma = Array.from(panel, (name, g) => ({
      gene: name, gamma: c.gamma_assigned[g], counts: c.gene_count[g] }));
  }
  return out;
}

async function spot(spotId) {
  const id = Number(spotId);
  if (!Number.isInteger(id)) throw new Error(`${spotId} is not a spot id`);
  const res = await deps.querySpot(id);
  if (!res.success) throw new Error(res.error);
  const cands = res.neighborIds.map((cellId, i) => ({
    cell: cellId,
    class: res.neighborClasses ? res.neighborClasses[i] : null,
    prob: res.probabilities[i],
  }));
  cands.push({ cell: 'background', prob: res.probabilities[res.neighborIds.length] });
  let best = 0;
  res.probabilities.forEach((p, i) => { if (p > res.probabilities[best]) best = i; });
  return {
    spot: id,
    gene: res.geneName,
    position: { x: res.x, y: res.y, z: res.z, plane: planeOf(res.z),
                z_is: 'the anisotropy scaled z the model works in; plane is the ' +
                      'plane index, None when the run carries no voxel_size' },
    assigned_to: cands[best].cell,
    prob: res.probabilities[best],
    candidates: cands,
    candidates_are: 'the nearest cells the spot was scored against, plus the ' +
                    'background, with the probability of each',
  };
}

function gene(name) {
  const m = meta();
  const g = geneIndex(name);
  const c = cfg() || {};
  const nK = m.class_names.length;
  const scan = allCells();
  const soft = new Array(nK).fill(0);
  const hard = new Array(nK).fill(0);
  let inCells = 0;
  const top = [];
  for (const r of scan) {
    const v = r.gene_count[g];
    inCells += v;
    hard[r.assigned] += v;
    for (let k = 0; k < nK; k++) soft[k] += r.class_prob[k] * v;
    top.push([r.internal, v, r.assigned]);
  }
  top.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const order = Array.from(soft, (v, k) => [k, v]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return {
    gene: name,
    eta: m.eta_bar[g],
    eta_is: 'eta_bar, the posterior mean of the gene efficiency; the reference ' +
            'expression of every class is multiplied by it',
    inefficiency: c.Inefficiency != null ? m.eta_bar[g] * c.Inefficiency : null,
    inefficiency_is: 'eta_bar times the Inefficiency setting, as Genes.inefficiency ' +
                     'defines it; None on runs without the settings record',
    misread_density: (m.rho_bar || {})[name] ?? null,
    misread_density_prior: (m.misread_density || {})[name] ?? null,
    misread_density_is: 'rho_bar, the rate of misread spots per unit volume the ' +
                        'model learned for this gene; the prior is where it started',
    total_spots: m.gene_total_spots ? m.gene_total_spots[g] : null,
    spots_called_misread: m.hard_misread_counts ? m.hard_misread_counts[g] : null,
    counts_in_cells: inCells,
    counts_are: 'soft, weighted by the spot assignment probabilities',
    counts_per_class: order.filter(([, v]) => v > COUNT_TOL).map(([k, v]) => ({
      class: m.class_names[k], soft: v, in_cells_called: hard[k] })),
    counts_per_class_are: 'soft: every cell weighted by its probability of the ' +
                          'class; in_cells_called: summed over the cells whose ' +
                          'most probable class it is',
    top_cells: top.slice(0, 10).filter(([, v]) => v > COUNT_TOL).map(([r, v, k]) => ({
      cell: toExternal(r), counts: v, class: m.class_names[k] })),
  };
}

function neighbours(label) {
  const names = meta().class_names;
  const c = cellRow(Number(label));
  if (!c.neighbours) {
    throw new Error('this run was written before diagnostics.db kept the ' +
                    'spatial neighbours; rerun with the current pciSeq');
  }
  const scan = allCells();
  const byInternal = new Map(scan.map(r => [r.internal, r]));
  const rows = [];
  for (const internal of c.neighbours) {
    const r = byInternal.get(internal);
    const k = r.assigned;
    const out = { cell: toExternal(internal), class: names[k], prob: r.class_prob[k] };
    if (c.x != null && r.x != null) {
      out.distance_xy = Math.hypot(r.x - c.x, r.y - c.y);
      out.plane_offset = r.z - c.z;
    }
    rows.push(out);
  }
  return {
    cell: Number(label),
    class: names[c.assigned_class_idx],
    n: rows.length,
    neighbours: rows,
    neighbours_are: 'the cells the spatial (mrf) term listens to, nearest first. ' +
                    'distance_xy is between centroids in pixels of the xy plane, ' +
                    'plane_offset in planes',
    mrf_beta: (cfg() || {}).mrf_beta ?? null,
  };
}

function classCounts(minCounts) {
  const names = meta().class_names;
  const nK = names.length;
  const hard = new Array(nK).fill(0);
  const soft = new Array(nK).fill(0);
  let n = 0;
  for (const r of allCells()) {
    if (minCounts != null && r.total < minCounts) continue;
    n += 1;
    hard[r.assigned] += 1;
    for (let k = 0; k < nK; k++) soft[k] += r.class_prob[k];
  }
  const rows = names.map((name, k) => ({ class: name, cells: hard[k], soft: soft[k] }));
  const zero = rows.filter(r => r.class === 'Zero');
  const rest = rows.filter(r => r.class !== 'Zero').sort((a, b) => b.cells - a.cells);
  return {
    n_cells: n,
    min_counts: minCounts ?? null,
    classes: zero.concat(rest),
    cells_is: 'hard: the number of cells whose most probable class it is',
    soft_is: 'the class probability summed over the cells, the expected ' +
             'number of cells of the class',
    min_counts_is: 'cells with fewer soft counts in total are left out',
  };
}

function findCells({ class_name = null, plane = null, min_counts = null,
                     top_two_within = null, n = 50 } = {}) {
  const names = meta().class_names;
  const wantClass = class_name != null ? classIndex(class_name) : null;
  if (plane != null) {
    if (!cellColumns().has('x')) {
      throw new Error('this run does not carry the cell centroids in diagnostics.db, ' +
                      'so the cells cannot be filtered by plane; rerun with the ' +
                      'current pciSeq');
    }
    if (planeOf(0) === null) {
      throw new Error('this run does not record its voxel size, so a centroid ' +
                      'cannot be put on a plane; rerun with the current pciSeq to record it');
    }
  }
  const hits = [];
  for (const r of allCells()) {
    if (wantClass != null && r.assigned !== wantClass) continue;
    if (min_counts != null && r.total < min_counts) continue;
    const top = topClasses(r, 2);
    const margin = top[0][1] - (top[1] ? top[1][1] : 0);
    if (top_two_within != null && margin > top_two_within) continue;
    if (plane != null && planeOf(r.z) !== Math.trunc(plane)) continue;
    hits.push({ r, top, margin });
  }
  hits.sort((a, b) => b.top[0][1] - a.top[0][1] || a.r.internal - b.r.internal);
  return {
    n_matching: hits.length,
    shown: Math.min(hits.length, n),
    filters: { class_name, plane, min_counts, top_two_within },
    cells: hits.slice(0, n).map(({ r, top, margin }) => ({
      cell: toExternal(r.internal),
      class: names[r.assigned],
      prob: top[0][1],
      runner_up: names[top[1][0]],
      margin,
      total_counts: r.total,
    })),
    cells_are: 'matched on the most probable class; margin is the probability of ' +
               'the assigned class minus the runner up; plane is the plane the ' +
               'centroid falls on, rounded down as for the spots; sorted by prob, ' +
               'the first n shown',
  };
}

function metadataTool(key) {
  const m = meta();
  const kind = (v) => {
    if (Array.isArray(v)) {
      const inner = v.length && Array.isArray(v[0]) ? ` of lists of ${v[0].length}` : '';
      return `list of ${v.length}${inner}`;
    }
    if (v && typeof v === 'object') return `dict of ${Object.keys(v).length} keys`;
    return typeof v === 'number' ? 'number' : 'text';
  };
  if (key == null) {
    return {
      keys: Object.entries(m).map(([k, v]) => ({ key: k, kind: kind(v) })),
      note: 'call again with a key for its value. eta_bar, gene_total_spots ' +
            'and hard_misread_counts follow gene_panel; log_prior and ' +
            'class_names go together; mean_gene_reads_per_class and ' +
            'sc_mean_expression are gene by class',
    };
  }
  if (!(key in m)) throw new Error(`no metadata key '${key}', call metadata() for the list`);
  return { key, value: m[key] };
}

// Why a cell got its class, read from the run's own numbers.
//
// The run saves, per cell, the gene log-likelihood of every class and the per gene
// contributions for the assigned class and the runner up (diagnostics.db format
// version 1). So the default comparison is READ, never recomputed: the story told
// here in five years is the story of the run, whatever the model looks like then.
// Against any other class only the totals are saved (per gene for every class
// would be ~800 MB), and the answer says so.
function explainCell(label, vsClass = null, topN = 10) {
  const m = meta();
  if (!cellColumns().has('gene_loglik')) {
    throw new Error('this run was made before pciSeq saved the class score ' +
                    '(diagnostics.db format version 1), so the explanation cannot be ' +
                    'read from it. Regenerate the run with the current pciSeq.');
  }
  const row = toInternal(label);
  if (row === 0) throw new Error('cell 0 is the background pseudocell, not a cell');
  const got = db().prepare(`SELECT * FROM cells WHERE ${deps.getCellKey()} = ?`).get(row);
  if (!got) throw new Error(`cell ${label} is not in diagnostics.db`);
  const classProb = f32(got.class_prob);
  const geneLoglik = f32(got.gene_loglik);
  const counts = f32(got.gene_count);
  const mrf = f32(got.mrf);
  const logPrior = m.log_prior;
  const names = m.class_names;
  const panel = m.gene_panel;
  const means = m.mean_gene_reads_per_class;    // gene by class
  const a = got.assigned_class_idx;

  let other;
  if (vsClass == null) {
    other = got.runner_up_idx;
    if (other < 0) {
      throw new Error(`cell ${label} is ${names[a]} and no other class has any ` +
                      'probability, so there is no runner up to compare against. Ask the ' +
                      'user which class to compare against and call again with vs_class');
    }
  } else {
    other = classIndex(vsClass);
    if (other === a) {
      throw new Error(`cell ${label} is already ${vsClass}, pick another class to compare`);
    }
  }

  const out = {
    cell: Number(label),
    assigned: names[a],
    compared_with: names[other],
    prob_assigned: classProb[a],
    prob_compared: classProb[other],
    score: {
      gene_loglik: { assigned: geneLoglik[a], compared: geneLoglik[other] },
      log_prior: { assigned: logPrior[a], compared: logPrior[other] },
      spatial: { assigned: mrf[a], compared: mrf[other] },
    },
    counts_are: 'soft, weighted by the spot assignment probabilities',
    means_are: 'the average count over the cells of this run, each weighted by ' +
               'its probability of being that class. An after the fact summary ' +
               'of the run, not the cell type definitions the likelihood scores ' +
               'against',
    score_is: 'saved by the run itself at fit time, read here, not recomputed',
  };

  if (vsClass != null && other !== got.runner_up_idx) {
    // per gene detail is only saved for the runner up
    out.genes_favouring_assigned = [];
    out.genes_favouring_compared = [];
    out.detail_note = 'the run saves the per gene contributions only for the assigned ' +
      'class and the runner up (' + names[got.runner_up_idx >= 0 ? got.runner_up_idx : a] +
      '), so against ' + vsClass + ' only the three score totals are available. The ' +
      'gene log-likelihood difference above is still the run\'s own number.';
    return out;
  }

  // per gene: the run's own contributions, diff positive pulls for the assigned
  const ca = f32(got.contr_assigned);
  const cr = f32(got.contr_runner_up);
  const geneRow = g => ({
    gene: panel[g],
    counts: counts[g],
    mean_in_assigned: means[g][a],
    mean_in_compared: means[g][other],
    diff: ca[g] - cr[g],
  });
  const byDiff = Array.from(ca, (v, g) => [g, v - cr[g]])
    .sort((x, y) => y[1] - x[1] || x[0] - y[0]);
  const forA = byDiff.slice(0, topN).filter(([, d]) => d > 0).map(([g]) => geneRow(g));
  const forO = byDiff.slice().reverse()
    .sort((x, y) => x[1] - y[1] || x[0] - y[0]).slice(0, topN)
    .filter(([, d]) => d < 0).map(([g]) => geneRow(g));
  out.genes_favouring_assigned = forA;
  out.genes_favouring_compared = forO;
  out.sum_favouring_assigned = forA.reduce((s2, g) => s2 + g.diff, 0);
  out.sum_favouring_compared = forO.reduce((s2, g) => s2 + g.diff, 0);

  // the cell's biggest counts that barely separate the two classes, why these two
  // were the finalists. Same rule as the python _shared_genes: of the ten biggest,
  // within a factor of e, at most five, biggest first.
  out.shared_genes = Array.from(counts, (v, g) => [g, v])
    .sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, 10)
    .filter(([g, v]) => v > COUNT_TOL && Math.abs(ca[g] - cr[g]) < 1.0)
    .slice(0, 5).map(([g]) => geneRow(g));
  out.shared_genes_are = 'the genes the cell holds most of that barely separate the two ' +
    'classes, each fitting both within a factor of e. Both classes ' +
    'express them, which is why these two were the finalists; the ' +
    'call rests on the genes in the two lists above';
  out.narrative = narrateCell(out);
  return out;
}

// whether the open run saves its class score (format version 1); false with no db
function hasSavedScore() {
  try {
    return cellColumns().has('gene_loglik');
  } catch (e) {
    return false;
  }
}

// ------------------------------------------------------------- arithmetic

// calculate() reads the expression itself, as the Python tool does with the ast;
// nothing is ever handed to eval. Same functions, same limits, same messages.
const CALC_MAX_LEN = 500;
const CALC_MAX_POWER = 1000;
const CALC_FUNCS = {
  exp: Math.exp,
  log: (x, base) => (base === undefined ? Math.log(x) : Math.log(x) / Math.log(base)),
  log10: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
  // Python's round: half to even, optional digit count
  round: (x, nd) => {
    const f = Math.pow(10, nd === undefined ? 0 : nd);
    const y = x * f;
    const r = Math.round(y);
    const out = (Math.abs(y % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r;
    return nd === undefined ? out : out / f;
  },
};

function calculate(expression) {
  const text = String(expression);
  if (text.length > CALC_MAX_LEN) {
    throw new Error(`expression longer than ${CALC_MAX_LEN} characters`);
  }
  const bad = () => new Error(`cannot read '${text}' as arithmetic`);
  const notAllowed = () => new Error(
    `${text}: only numbers, + - * / ** and ${Object.keys(CALC_FUNCS).join(', ')} are allowed`);

  // tokens: numbers, names, operators, brackets, commas
  const tokens = text.match(/\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\*\*|[+\-*/(),]|[A-Za-z_]\w*|\S/g) || [];
  if (/\S/.test(text) === false || tokens.length === 0) throw bad();
  let pos = 0;
  const peek = () => tokens[pos];
  const take = (t) => { if (tokens[pos] !== t) throw bad(); pos++; };

  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos++];
      const w = term();
      v = op === '+' ? v + w : v - w;
    }
    return v;
  }
  function term() {
    let v = unary();
    while (peek() === '*' || peek() === '/') {
      const op = tokens[pos++];
      const w = unary();
      if (op === '/') {
        if (w === 0) throw new Error(`${text}: division by zero`);
        v = v / w;
      } else v = v * w;
    }
    return v;
  }
  function unary() {
    if (peek() === '+' || peek() === '-') {
      const op = tokens[pos++];
      const v = unary();
      return op === '-' ? -v : v;
    }
    return power();
  }
  function power() {
    const base = primary();
    if (peek() === '**') {
      pos++;
      const e = unary();                       // right associative, unary allowed
      if (Math.abs(e) > CALC_MAX_POWER) {
        throw new Error(`exponent larger than ${CALC_MAX_POWER}`);
      }
      return Math.pow(base, e);
    }
    return base;
  }
  function primary() {
    const t = peek();
    if (t === undefined) throw bad();
    if (t === '(') {
      pos++;
      const v = expr();
      take(')');
      return v;
    }
    if (/^(\d|\.\d)/.test(t)) { pos++; return Number(t); }
    if (/^[A-Za-z_]/.test(t)) {
      pos++;
      if (!(t in CALC_FUNCS) || peek() !== '(') throw notAllowed();
      pos++;
      const args = [expr()];
      while (peek() === ',') { pos++; args.push(expr()); }
      take(')');
      const v = CALC_FUNCS[t](...args);
      if (!Number.isFinite(v)) throw new Error(`${text}: math domain error`);
      return v;
    }
    throw notAllowed();
  }

  const result = expr();
  if (pos !== tokens.length) throw bad();
  if (!Number.isFinite(result)) throw new Error(`${text}: overflow`);
  return { expression: text, result };
}

module.exports = { init, cell, cellCounts, theta, gamma, spot, gene, neighbours, explainCell, hasSavedScore,
                   classCounts, findCells, metadataTool, calculate,
                   toInternal, toExternal, planeOf };
