// The run tools, ported from pciSeq/src/mcp/tools.py, reading only.
//
// Everything comes out of diagnostics.db and its metadata; nothing is recomputed
// with today's formulas, so a run answered here in a year is answered with its own
// numbers (bead cz1.9). The python MCP server stays for machines with no screen,
// so a field here should mean what the same field means there.
//
// Three rules, the same as the Python file:
//   1. cell labels in and out are the labels of the segmentation, never internal.
//   2. counts are soft, weighted by assignment probability, and every answer that
//      reports one says so.
//   3. row 0 of the cells table is the background pseudocell, never reported.
//
// Dependencies come in through init() so run.check.js can drive it in plain node
// with a database and no Electron.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { narrateCell } = require('./narrative');

let deps = { getDb: null, getMeta: null, getCellKey: null, querySpot: null, compose: null, classColour: null, geneGlyph: null };

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
  const m = (deps.getMeta && deps.getMeta()) || {};
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

// every array of one cell, keyed by column name, taking a segmentation label.
// NOT cellRow: that name is the cellData.tsv tool further down, and two functions
// of the same name silently left the later one winning for every caller here.
function cellArrays(label) {
  const row = toInternal(label);
  if (row === 0) throw new Error('cell 0 is the background pseudocell, not a cell');
  const got = db().prepare(`SELECT * FROM cells WHERE ${deps.getCellKey()} = ?`).get(row);
  if (!got) throw new Error(`cell ${label} is not in diagnostics.db`);
  const out = {
    row,
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

// how a gene's spots are drawn on the map, { colour, shape, glyph_is }, or null
// when the window has not said
function glyphOf(gene) {
  const g = deps.geneGlyph ? deps.geneGlyph(gene) : null;
  if (!g) return null;
  return { ...g, glyph_is: `the colour and marker shape ${gene} spots are drawn with on the map` };
}

// the assigned class of one cell: the one the run saved, the most probable
// otherwise (older dbs have no assigned_class_idx)
function assignedIdx(c) {
  return c.assigned_class_idx ?? topClasses(c, 1)[0][0];
}

// ------------------------------------------------------------------ tools

function cell(label) {
  const names = meta().class_names;
  const panel = meta().gene_panel;
  const c = cellArrays(label);
  const counts = c.gene_count;
  const top = Array.from(counts, (v, g) => [g, v])
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 10);
  const k = assignedIdx(c);
  const assigned = names[k];
  return {
    cell: Number(label),
    colour: deps.classColour ? deps.classColour(assigned) : null,
    colour_is: `the colour ${assigned} is drawn in on the map; null when the viewer ` +
               'window has not said',
    total_counts: counts.reduce((s, v) => s + v, 0),
    counts_are: 'soft, weighted by the spot assignment probabilities',
    classes: topClasses(c, 5).map(([k, p]) => ({ class: names[k], prob: p })),
    top_genes: top.filter(([, v]) => v > COUNT_TOL)
      .map(([g, v]) => ({ gene: panel[g], counts: v })),
    theta_bar: c.theta_bar[k],
    theta_bar_is: `theta_bar of the assigned class, ${assigned}, the value the ` +
                  'cell tooltip shows; the theta tool gives it for any class',
    neighbours: c.neighbours ? Array.from(c.neighbours, r => toExternal(r)) : null,
    neighbours_are: 'the cells the spatial (mrf) term listens to, nearest first',
  };
}

function cellCounts(label, gene) {
  const panel = meta().gene_panel;
  const c = cellArrays(label);
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

function theta(label, className) {
  const names = meta().class_names;
  const c = cellArrays(label);
  const assigned = names[assignedIdx(c)];
  const cls = className ?? assigned;
  const k = names.indexOf(cls);
  if (k < 0) throw new Error(`no class '${cls}' in this run`);
  return {
    cell: Number(label),
    class: cls,
    is_assigned: cls === assigned,
    theta_bar: c.theta_bar[k],
    theta_bar_is: "the posterior mean of theta under this class: the factor " +
                  "scaling the class's expected counts to the cell's total. " +
                  'Gamma(rTheta, rTheta) prior, mean 1',
    class_prob: c.class_prob[k],
    rTheta: (cfg() || {}).rTheta ?? null,
  };
}

function gamma(label, gene) {
  const names = meta().class_names;
  const panel = meta().gene_panel;
  const c = cellArrays(label);
  const out = {
    cell: Number(label),
    class: names[c.assigned_class_idx],
    gamma_is: 'gamma_bar, the posterior mean of the per cell, per gene scale that ' +
              'absorbs overdispersion, under the assigned class only. ' +
              'diagnostics.db does not keep the (cell, gene, class) array, so ' +
              'gamma under another class is not available',
    expected_is: 'the count the assigned class predicts for the gene in this cell, ' +
                 'after Inefficiency, eta and theta. gamma is not counts over ' +
                 'expected: it is (rSpot + counts) over (rSpot + expected), which ' +
                 'pulls it toward 1, so say how far off a gene is from counts ' +
                 'against expected, not from gamma',
  };
  // gamma_bar = (rSpot + counts) / (rSpot + expected), see VarBayes.gamma_upd in
  // pciSeq. Turned round it gives back the expected count the fit used
  const rSpot = Number(meta().rSpot);
  const expected = g => Math.max((rSpot + c.gene_count[g]) / c.gamma_assigned[g] - rSpot, 0);
  if (gene != null) {
    const g = geneIndex(gene);
    out.gene = gene;
    out.gamma = c.gamma_assigned[g];
    out.counts = c.gene_count[g];
    out.expected = expected(g);
  } else {
    out.gamma = Array.from(panel, (name, g) => ({
      gene: name, gamma: c.gamma_assigned[g], counts: c.gene_count[g], expected: expected(g) }));
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
    glyph: glyphOf(res.geneName),
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
    glyph: glyphOf(name),
    eta: m.eta_bar[g],
    eta_is: 'eta_bar, the posterior mean of the gene inefficiency; the reference ' +
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
  const c = cellArrays(Number(label));
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

// the centroids in diagnostics.db (x, y in image pixels, z anisotropy scaled), which
// any filter on position needs; planes need the voxel size on top
function needCentroids(what) {
  if (!cellColumns().has('x')) {
    throw new Error('this run does not carry the cell centroids in diagnostics.db, ' +
                    `so the cells cannot be filtered by ${what}; rerun with the current pciSeq`);
  }
}
function needPlanes() {
  if (planeOf(0) === null) {
    throw new Error('this run does not record its voxel size, so a centroid ' +
                    'cannot be put on a plane; rerun with the current pciSeq to record it');
  }
}

// a range test where a missing end means no limit
const within = (v, from, to) => (from == null || v >= from) && (to == null || v <= to);

// The cells matching the filters. Position is the centroid: inside the box when it
// falls in x_from..x_to, y_from..y_to (image pixels) and on a plane in
// plane_from..plane_to. The class is a probability, so as with spots_of_class:
// the list needs a yes or no per cell, the assigned class by default or any class
// probability above min_class_prob (class_rule above), and expected_count is the
// soft number, the sum of the class probability over every cell the other filters
// keep, so cells that are only partly that class count partly.
// Is (x, y) inside the polygon [[x, y], ...]? Ray casting, the same test the
// charts use (utils/pointInPolygon.js); here for the region filter of find_cells.
function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

// polygon: keep only the cells whose centroid is inside it, image pixels
function findCells({ class_name = null, class_rule = 'assigned', min_class_prob = null,
                     plane = null, plane_from = null, plane_to = null,
                     x_from = null, x_to = null, y_from = null, y_to = null,
                     polygon = null, min_counts = null, top_two_within = null, n = 50 } = {}) {
  const names = meta().class_names;
  const k = class_name != null ? classIndex(class_name) : null;
  if (!['assigned', 'above'].includes(class_rule)) throw new Error('class_rule must be assigned or above');
  if (class_rule === 'above' && min_class_prob == null) throw new Error('class_rule above needs min_class_prob');
  if (plane != null) { plane_from = plane; plane_to = plane; }   // one plane is a range of one
  const byPlane = plane_from != null || plane_to != null;
  const byXY = [x_from, x_to, y_from, y_to].some(v => v != null) || polygon != null;
  if (byPlane || byXY) needCentroids(byPlane ? 'plane' : 'position');
  if (byPlane) needPlanes();

  const hits = [];
  let expected = 0;
  for (const r of allCells()) {
    if (min_counts != null && r.total < min_counts) continue;
    const top = topClasses(r, 2);
    const margin = top[0][1] - (top[1] ? top[1][1] : 0);
    if (top_two_within != null && margin > top_two_within) continue;
    if (byXY && !(within(r.x, x_from, x_to) && within(r.y, y_from, y_to))) continue;
    if (polygon && !pointInPolygon(r.x, r.y, polygon)) continue;
    const pl = byPlane ? planeOf(r.z) : null;
    if (byPlane && !within(pl, plane_from, plane_to)) continue;
    if (k != null) {
      expected += r.class_prob[k];
      const isClass = class_rule === 'assigned' ? r.assigned === k : r.class_prob[k] > min_class_prob;
      if (!isClass) continue;
    }
    hits.push({ r, top, margin, pl });
  }
  hits.sort((a, b) => b.top[0][1] - a.top[0][1] || a.r.internal - b.r.internal);
  const out = {
    n_matching: hits.length,
    shown: Math.min(hits.length, n),
    filters: { class_name, class_rule, min_class_prob, plane_from, plane_to,
               x_from, x_to, y_from, y_to, min_counts, top_two_within },
    cells: hits.slice(0, n).map(({ r, top, margin, pl }) => ({
      cell: toExternal(r.internal),
      class: names[r.assigned],
      prob: top[0][1],
      ...(k != null ? { prob_of_class: r.class_prob[k] } : {}),
      runner_up: top[1] ? names[top[1][0]] : null,
      margin,
      total_counts: r.total,
      ...(byXY || byPlane ? { x: r.x, y: r.y, plane: pl ?? planeOf(r.z) } : {}),
    })),
    cells_are: (k == null ? 'every cell the filters keep'
                : class_rule === 'assigned' ? `cells assigned ${class_name}`
                : `cells with a probability above ${min_class_prob} of being ${class_name}`) +
               '; position is the centroid (x, y in image pixels, plane rounded down as ' +
               'for the spots); margin is the probability of the assigned class minus ' +
               'the runner up; sorted by prob, the first n shown',
  };
  if (k != null) {
    out.expected_count = expected;
    out.expected_count_is = `the sum of every kept cell's probability of being ${class_name}, ` +
                            'so cells that are only partly that class count partly';
  }
  return out;
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

  // the class score is the sum of the three parts; added here so the chat never has to
  const total = k => geneLoglik[k] + logPrior[k] + mrf[k];
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
      total: { assigned: total(a), compared: total(other) },
      difference: total(a) - total(other),
      difference_is: 'total assigned minus total compared, the three parts already added ' +
                     'up; it equals log(prob_assigned / prob_compared). Quote it, never add ' +
                     'the parts yourself',
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
// The documentation pages saved inside the run at fit time (the docs table, pciSeq
// export_docs), as a Map of page -> text.
// null for runs written before the table existed, or when it came out empty; the
// docs tool then says the documentation is not available.
function docsFromRun() {
  const h = db();   // first, see cellColumns for why
  if (cache.docs === undefined) {
    const has = h.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='docs'").get();
    const rows = has ? h.prepare('SELECT page, text FROM docs').all() : [];
    cache.docs = rows.length ? new Map(rows.map(r => [r.page, r.text])) : null;
  }
  return cache.docs;
}

function hasSavedScore() {
  try {
    return cellColumns().has('gene_loglik');
  } catch (e) {
    return false;
  }
}

// ------------------------------------------------------- the viewer files
//
// The spot lists live in the run's arrow shards (the same files the map streams),
// not in diagnostics.db. They are the run's own output, so reading them keeps the
// read-only rule; the arrow bundle is the one the renderer already ships.

let arrowP = null;
function arrow() {
  if (!arrowP) {
    arrowP = import(pathToFileURL(
      path.join(__dirname, '..', 'lib', 'vendor', 'apache-arrow-12.0.1.esm.js')).href);
  }
  return arrowP;
}

// db().name is <viewer_data>/diagnostics/diagnostics.db
function viewerDataDir() {
  return path.dirname(path.dirname(db().name));
}

function geneDict() {
  const h = db();
  if (!cache.geneDict) {
    const raw = JSON.parse(fs.readFileSync(
      path.join(viewerDataDir(), 'arrow_spots', 'gene_dict.json'), 'utf8'));
    cache.geneDict = new Map(Object.entries(raw).map(([k, v]) => [Number(k), v]));
  }
  return cache.geneDict;
}

// one arrow record batch at a time, across the spot shards in order
async function* spotBatches() {
  const dir = path.join(viewerDataDir(), 'arrow_spots');
  let files;
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.feather')).sort();
  } catch (e) {
    throw new Error('the viewer files (arrow_spots) are not in this run');
  }
  const { tableFromIPC } = await arrow();
  for (const f of files) {
    for (const b of tableFromIPC(fs.readFileSync(path.join(dir, f))).batches) yield b;
  }
}

// a column's flat typed values, and for list columns the offsets too
const flat = (b, name) => b.getChild(name).data[0].values;
// an empty shard (a plane with no spots) has a list column with no child array,
// so hand back empty typed arrays rather than reach into the missing child
const flatList = (b, name) => {
  const d = b.getChild(name).data[0];
  const child = d.children[0];
  return { offs: d.valueOffsets, vals: child && child.values ? child.values : new Int32Array(0) };
};

// a float the way the tsv files print it, three decimals, as the python _tsv
const tsv3 = v => Math.round(v * 1000) / 1000;

async function spotsInCell(label, gene) {
  label = Number(label);
  toInternal(label);                     // raises if it is not a cell
  const names = geneDict();
  if (gene != null && ![...names.values()].includes(gene)) {
    throw new Error(`no gene '${gene}' in the panel`);
  }
  const perGene = new Map();
  let sawInside = false;
  for await (const b of spotBatches()) {
    if (!b.getChild('inside_cell')) break;
    sawInside = true;
    const ic = flat(b, 'inside_cell');
    const gid = flat(b, 'gene_id');
    for (let i = 0; i < ic.length; i++) {
      if (ic[i] === label) perGene.set(gid[i], (perGene.get(gid[i]) || 0) + 1);
    }
  }
  if (!sawInside) {
    throw new Error('this run has no containment data. geneData gained the inside_cell ' +
                    'column after it was produced, so the run has to be repeated to ' +
                    'answer this. cell_counts works on any run.');
  }
  const note = "hard count: spots whose pixel falls inside this cell's segmentation " +
               'mask, no probabilities involved. The model may have assigned some of ' +
               'them elsewhere, and cell_counts may include spots from outside the mask';
  if (gene != null) {
    let n = 0;
    for (const [gid, c] of perGene) if (names.get(gid) === gene) n = c;
    return { cell: label, gene, spots: n, spots_are: note };
  }
  const rows = [...perGene.entries()]
    .map(([gid, n]) => ({ gene: names.get(gid), spots: n }))
    .sort((a, b) => b.spots - a.spots || (a.gene < b.gene ? -1 : 1));
  return {
    cell: label,
    total_spots: rows.reduce((s2, r) => s2 + r.spots, 0),
    per_gene: rows,
    spots_are: note,
  };
}

async function spotsOfCell(label, minProb = null, gene = null) {
  label = Number(label);
  toInternal(label);
  const names = geneDict();
  if (gene != null && ![...names.values()].includes(gene)) {
    throw new Error(`no gene '${gene}' in this run`);
  }
  const rows = [];
  for await (const b of spotBatches()) {
    const sid = flat(b, 'spot_id');
    const gid = flat(b, 'gene_id');
    const na = flatList(b, 'neighbour_array');
    const np = flatList(b, 'neighbour_prob');
    for (let i = 0; i < sid.length; i++) {
      const lo = na.offs[i], hi = na.offs[i + 1];
      for (let j = lo; j < hi; j++) {
        if (na.vals[j] !== label) continue;
        if (gene != null && names.get(gid[i]) !== gene) break;
        const p = np.vals[j];
        const keep = minProb == null ? na.vals[lo] === label : p > minProb;
        if (keep) rows.push({ spot: Number(sid[i]), gene: names.get(gid[i]), prob: p });
        break;
      }
    }
  }
  rows.sort((a, b) => b.prob - a.prob);
  const note = minProb == null
    ? 'spots whose most likely parent is this cell. That is the argmax, ' +
      'not a hard assignment: the lowest probability here can be well ' +
      'under 0.5, and the cell also draws counts from spots whose most ' +
      'likely parent is another cell'
    : `every spot with probability above ${minProb} on this cell. Their ` +
      "probabilities add up to the cell's soft counts, so this is the " +
      'decomposition of cell_counts. Probabilities are rounded to 3 ' +
      'decimals in the viewer files, so anything under 0.0005 is absent';
  return {
    cell: label,
    gene,
    definition: minProb == null ? 'most likely parent' : `prob > ${minProb}`,
    n_spots: rows.length,
    sum_of_probs: rows.reduce((s2, r) => s2 + r.prob, 0),
    spots: rows,
    spots_are: note,
  };
}

// ------------------------------------------------------------ spots of a class

// "The Plp1 spots in Pvalb cells" has more than one reading, because both links are
// probabilities: spot -> cell (the most likely parent, or any parent above a cut)
// and cell -> class (the assigned class, or any class above a cut). 'soft' weights
// by the probability instead of cutting, and soft on both is pciSeq's own count,
// the default. Whatever the rules, the answer also carries the soft count and the
// strict one (most likely parent, assigned that class), so the two can be compared.
const SPOT_RULES = ['soft', 'most_likely', 'above'];
const CLASS_RULES = ['soft', 'assigned', 'above'];
const SPOTS_LISTED = 50;

// every cell by its segmentation label
function cellsByLabel() {
  const h = db();   // first, see cellColumns for why
  if (!cache.byLabel) cache.byLabel = new Map(allCells().map(c => [toExternal(c.internal), c]));
  return cache.byLabel;
}

// the spots of one gene: [{ spot, labels, probs }], candidate cells most likely first
async function geneSpots(gene) {
  const names = geneDict();
  if (![...names.values()].includes(gene)) throw new Error(`no gene '${gene}' in this run`);
  const out = [];
  for await (const b of spotBatches()) {
    const sid = flat(b, 'spot_id');
    const gid = flat(b, 'gene_id');
    const na = flatList(b, 'neighbour_array');
    const np = flatList(b, 'neighbour_prob');
    for (let i = 0; i < sid.length; i++) {
      if (names.get(gid[i]) !== gene) continue;
      const lo = na.offs[i], hi = na.offs[i + 1];
      out.push({ spot: Number(sid[i]), labels: Array.from(na.vals.subarray(lo, hi)),
                 probs: Array.from(np.vals.subarray(lo, hi)) });
    }
  }
  return out;
}

// the counting, on plain arrays so it can be checked without the run's files.
// spots: from geneSpots; cells: label -> { class_prob, assigned }; k: the class.
function countSpotsOfClass(spots, cells, k, r) {
  let soft = 0, strict = 0, total = 0;
  const kept = [];
  for (const s of spots) {
    s.labels.forEach((label, j) => {
      const c = label === 0 ? null : cells.get(label);
      if (!c) return;   // the background, or a cell the run does not have
      const pSpot = s.probs[j], pClass = c.class_prob[k];
      const top = j === 0;
      soft += pSpot * pClass;
      if (top && c.assigned === k) strict += 1;
      const spotOk = r.spot_rule === 'soft' || (r.spot_rule === 'most_likely' ? top : pSpot > r.min_spot_prob);
      const classOk = r.class_rule === 'soft' || (r.class_rule === 'assigned' ? c.assigned === k : pClass > r.min_class_prob);
      const w = (r.spot_rule === 'soft' ? pSpot : 1) * (r.class_rule === 'soft' ? pClass : 1);
      if (!spotOk || !classOk || !(w > 0)) return;
      total += w;
      kept.push({ spot: s.spot, cell: label, prob_spot: pSpot, prob_class: pClass, weight: w });
    });
  }
  kept.sort((a, b) => b.weight - a.weight || a.spot - b.spot);
  return { soft, strict, total, kept };
}

async function spotsOfClass({ gene, class_name, spot_rule = 'soft', class_rule = 'soft',
                              min_spot_prob = null, min_class_prob = null, limit = SPOTS_LISTED }) {
  const k = classIndex(class_name);
  if (!SPOT_RULES.includes(spot_rule)) throw new Error(`spot_rule must be one of ${SPOT_RULES.join(', ')}`);
  if (!CLASS_RULES.includes(class_rule)) throw new Error(`class_rule must be one of ${CLASS_RULES.join(', ')}`);
  if (spot_rule === 'above' && min_spot_prob == null) throw new Error('spot_rule above needs min_spot_prob');
  if (class_rule === 'above' && min_class_prob == null) throw new Error('class_rule above needs min_class_prob');
  const r = { spot_rule, class_rule, min_spot_prob, min_class_prob };
  const { soft, strict, total, kept } = countSpotsOfClass(await geneSpots(gene), cellsByLabel(), k, r);
  const spotIs = { soft: 'each spot weighted by its probability of belonging to the cell',
                   most_likely: 'only spots whose most likely parent is the cell',
                   above: `only spots with probability above ${min_spot_prob} on the cell` }[spot_rule];
  const classIs = { soft: `each cell weighted by its probability of being ${class_name}`,
                    assigned: `only cells assigned ${class_name}`,
                    above: `only cells with a probability above ${min_class_prob} of being ${class_name}` }[class_rule];
  return {
    gene, class: class_name, rules: r,
    count: total,
    count_is: `${spotIs}; ${classIs}`,
    n_spots: new Set(kept.map(x => x.spot)).size,
    soft_count: soft,
    strict_count: strict,
    counts_are: `soft_count is pciSeq's own number, every ${gene} spot weighted by ` +
                `P(spot -> cell) x P(cell is ${class_name}) and summed; strict_count is ` +
                `the ${gene} spots whose most likely parent is a cell assigned ${class_name}. ` +
                'A spot can count towards several cells under the soft rules',
    spots: kept.slice(0, limit),
    spots_are: `the ${Math.min(limit, kept.length)} highest weighted of ${kept.length} ` +
               'spot to cell pairs; probabilities are rounded to 3 decimals in the viewer files',
  };
}

async function spotRow(spotId) {
  const id = Number(spotId);
  if (!Number.isInteger(id)) throw new Error(`${spotId} is not a spot id`);
  for await (const b of spotBatches()) {
    const sid = flat(b, 'spot_id');
    const i = sid.indexOf(id);
    if (i < 0) continue;
    const g = name => b.getChild(name) && b.getChild(name).get(i);
    const na = [...g('neighbour_array')].map(Number);
    const out = {
      gene_name: geneDict().get(Number(g('gene_id'))),
      gene_id: Number(g('gene_id')),
      spot_id: id,
      x: tsv3(g('x')), y: tsv3(g('y')), z: tsv3(g('z')),
      plane_id: Number(g('plane_id')),
      neighbour: na[0],
      neighbour_array: na,
      neighbour_prob: [...g('neighbour_prob')].map(tsv3),
      omp_score: tsv3(g('omp_score')),
      omp_intensity: tsv3(g('omp_intensity')),
      is_hard_misread: Number(g('is_hard_misread')),
      source: 'the viewer files, written from the same frame as geneData.tsv',
    };
    if (b.getChild('inside_cell')) out.inside_cell = Number(g('inside_cell'));
    return out;
  }
  throw new Error(`no spot ${id} in this run`);
}

async function cellRow(label) {
  label = Number(label);
  toInternal(label);
  const { tableFromIPC } = await arrow();
  const dir = path.join(viewerDataDir(), 'arrow_cells');
  let hit = null;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.feather')).sort()) {
    const t = tableFromIPC(fs.readFileSync(path.join(dir, f)));
    for (const b of t.batches) {
      const ids = flat(b, 'cell_id');
      const i = ids.indexOf(label);
      if (i >= 0) { hit = { b, i }; break; }
    }
    if (hit) break;
  }
  if (!hit) throw new Error(`no cell ${label} in this run`);
  const g = name => hit.b.getChild(name).get(hit.i);
  const genes = [...g('gene_names')].map(String);
  // the exact spot lists need the model's probabilities, which the arrow files
  // round to 3 decimals; querySpot reads the terms from diagnostics.db and gives
  // them at full precision, the python fallback does the same. Not quite exact at
  // the 0.0001 cut-off itself, the tsv is the authority there.
  const cands = (await spotsOfCell(label, -1)).spots;
  const perGene = new Map(genes.map(x => [x, []]));
  for (const c of cands) {
    const res = await deps.querySpot(c.spot);
    if (!res.success) continue;
    const k = res.neighborIds.indexOf(label);
    if (k >= 0 && res.probabilities[k] > 0.0001 && perGene.has(c.gene)) {
      perGene.get(c.gene).push(c.spot);
    }
  }
  return {
    Cell_Num: label,
    X: tsv3(g('X')), Y: tsv3(g('Y')), Z: tsv3(g('Z')),
    Genenames: genes,
    CellGeneCount: [...g('gene_counts')].map(tsv3),
    spot_id: genes.map(x => perGene.get(x)),
    ClassName: [...g('class_name')].map(String),
    Prob: [...g('prob')].map(tsv3),
    source: 'rebuilt from the viewer files. spot_id can miss a few spots sitting ' +
            'within 0.0005 of the 0.0001 cut-off',
    counts_are: 'soft, weighted by the spot assignment probabilities. ' +
                'spot_id lists every spot with probability above 0.0001 on ' +
                'this cell, lined up with Genenames, and their probabilities ' +
                'add up to CellGeneCount',
  };
}

// ------------------------------------------------------------- the pictures
//
// cell_image and plane_image, ported from the python tools. The logic here works
// out what to draw: which background image, which plane, which tiles of the
// pyramid, which polygons at which output pixel. The drawing itself happens on a
// canvas in the renderer (deps.compose, electron/compose.js), so the pictures are
// only available while the viewer window is open. Not promised pixel-identical to
// the python ones (jpeg decoding and resampling differ by a hair), but the same
// plane, box and outlines.

const Database = require('better-sqlite3');
const TILE = 256;
const RED = [255, 96, 80];
const BLUE = [120, 210, 255];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function mbtilesName(file) {
  const con = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const row = con.prepare("SELECT value FROM metadata WHERE name = 'name'").get();
    const name = row && row.value ? String(row.value).trim() : '';
    return name || path.basename(file, '.mbtiles');
  } finally {
    con.close();
  }
}

// which background image to draw on, the same rules as the python _background:
// several images and no channel is a refusal that lists them, one image is always
// used whatever channel says, since its name cannot tell the stain
function background(channel) {
  const dir = viewerDataDir();
  const found = fs.readdirSync(dir).filter(f => f.endsWith('.mbtiles')).sort()
    .map(f => path.join(dir, f));
  if (!found.length) {
    throw new Error(`no .mbtiles in ${dir}, so there is no image to draw on. The viewer ` +
                    'tiles are made by pciSeq.stage_image; copy the file into viewer_data');
  }
  const names = found.map(mbtilesName);
  const listing = names.map((n, i) => `${n} (${path.basename(found[i])})`).join(', ');
  if (found.length === 1) {
    const note = channel != null
      ? `asked for '${channel}', but this run has only one background image, called ` +
        `'${names[0]}', so that is the one drawn. Which stain it is cannot be told ` +
        'from the file, only whoever made it knows'
      : null;
    return { file: found[0], name: names[0], names, note };
  }
  if (channel == null) {
    throw new Error(`this run has ${found.length} background images: ${listing}. Ask the ` +
                    'user which one they want and pass it as channel');
  }
  const want = String(channel).trim().toLowerCase();
  const keys = names.map((n, i) => [n.toLowerCase(), path.basename(found[i], '.mbtiles').toLowerCase()]);
  let hits = keys.map((k, i) => [k, i]).filter(([k]) => k.includes(want)).map(([, i]) => i);
  if (!hits.length) {
    hits = keys.map((k, i) => [k, i]).filter(([k]) => k.some(x => x.includes(want))).map(([, i]) => i);
  }
  if (hits.length !== 1) {
    throw new Error(`${hits.length ? 'more than one' : 'no'} background image matching ` +
                    `'${channel}'. This run has: ${listing}`);
  }
  return { file: found[hits[0]], name: names[hits[0]], names, note: null };
}

function mbtilesMeta(con) {
  const m = {};
  for (const r of con.prepare('SELECT name, value FROM metadata').all()) m[r.name] = r.value;
  const planes = m.planes
    ? m.planes.split(',').map(Number).sort((a, b) => a - b)
    : Array.from({ length: Number(m.plane_count || 1) }, (_, i) => i);
  return { imgW: Number(m.width), imgH: Number(m.height), maxzoom: Number(m.maxzoom),
           format: m.format || 'jpg', planes };
}

// the tiles covering a box of the image at a level fitting the asked width, plus
// where to crop, the same arithmetic as pciSeq.read_tiles
function tilePlan(con, meta, plane, box, width) {
  const [x0, y0, x1, y1] = box;
  const boxW = x1 - x0, boxH = y1 - y0;
  const want = width ? width / boxW : 1.0;
  const levelScale = z => TILE * 2 ** z / Math.max(meta.imgW, meta.imgH);
  let zoom = meta.maxzoom;
  for (let z = 0; z <= meta.maxzoom; z++) {
    if (levelScale(z) >= want) { zoom = z; break; }
  }
  const s2 = levelScale(zoom);
  const tx0 = Math.floor(x0 * s2 / TILE), ty0 = Math.floor(y0 * s2 / TILE);
  const tx1 = Math.floor((x1 * s2 - 1e-6) / TILE), ty1 = Math.floor((y1 * s2 - 1e-6) / TILE);
  const rows = con.prepare(
    'SELECT tile_column, tile_row, tile_data FROM tiles WHERE plane_id = ? AND ' +
    'zoom_level = ? AND tile_column BETWEEN ? AND ? AND tile_row BETWEEN ? AND ?')
    .all(plane, zoom, tx0, tx1, ty0, ty1);
  if (!rows.length) throw new Error(`no tiles for plane ${plane} at zoom ${zoom}`);
  const mime = meta.format === 'png' ? 'image/png' : 'image/jpeg';
  const outW = Math.max(1, Math.round(boxW * want));
  const outH = Math.max(1, Math.round(boxH * want));
  return {
    canvasW: (tx1 - tx0 + 1) * TILE,
    canvasH: (ty1 - ty0 + 1) * TILE,
    tiles: rows.map(r => ({ b64: r.tile_data.toString('base64'), mime,
                            dx: (r.tile_column - tx0) * TILE, dy: (r.tile_row - ty0) * TILE })),
    crop: { sx: Math.round(x0 * s2 - tx0 * TILE), sy: Math.round(y0 * s2 - ty0 * TILE),
            sw: Math.round(x1 * s2) - Math.round(x0 * s2), sh: Math.round(y1 * s2) - Math.round(y0 * s2) },
    outW, outH,
    scale: outW / boxW,
  };
}

// the outlines of one plane of the run, from the viewer's boundary shards
async function outlinesOnPlane(plane) {
  const h = db();
  if (!cache.outlines) cache.outlines = new Map();
  if (!cache.outlines.has(plane)) {
    const f = path.join(viewerDataDir(), 'arrow_boundaries',
                        'boundaries_plane_' + String(plane).padStart(2, '0') + '.feather');
    if (!fs.existsSync(f)) throw new Error(`no outlines for plane ${plane} in this run`);
    const { tableFromIPC } = await arrow();
    const rows = [];
    for (const b of tableFromIPC(fs.readFileSync(f)).batches) {
      const lab = flat(b, 'label');
      const xs = b.getChild('x_list');
      const ys = b.getChild('y_list');
      for (let i = 0; i < lab.length; i++) {
        rows.push({ label: Number(lab[i]),
                    x: Array.from(xs.get(i), Number), y: Array.from(ys.get(i), Number) });
      }
    }
    cache.outlines.set(plane, rows);
  }
  return cache.outlines.get(plane);
}

const polyArea = (xs, ys) => {
  let a = 0;
  for (let i = 0; i < xs.length; i++) {
    const j = (i + 1) % xs.length;
    a += xs[i] * ys[j] - xs[j] * ys[i];
  }
  return Math.abs(a) / 2;
};

// every plane this cell has an outline on, with the outline's area
async function outlineAreas(label) {
  const dir = path.join(viewerDataDir(), 'arrow_boundaries');
  const { tableFromIPC } = await arrow();
  const areas = new Map();
  for (const f of fs.readdirSync(dir).filter(x => /^boundaries_plane_.*\.feather$/.test(x)).sort()) {
    for (const b of tableFromIPC(fs.readFileSync(path.join(dir, f))).batches) {
      const lab = flat(b, 'label');
      const i = lab.indexOf(label);
      if (i < 0) continue;
      const xs = Array.from(b.getChild('x_list').get(i), Number);
      const ys = Array.from(b.getChild('y_list').get(i), Number);
      areas.set(Number(flat(b, 'plane_id')[i]), { area: polyArea(xs, ys), x: xs, y: ys });
    }
  }
  return areas;
}

const toPix = (pts, box, scale) => pts.map(([x, y]) => [(x - box[0]) * scale, (y - box[1]) * scale]);

async function cellImage(label, { context = false, plane = null, width = 1200,
                                  channel = null, neighbours = false, save_as = null } = {}) {
  label = Number(label);
  if (toInternal(label) === 0) throw new Error('cell 0 is the background pseudocell, not a cell');
  const bg = background(channel);
  const c = cellRowLite(label);
  const areas = await outlineAreas(label);
  if (!areas.size) throw new Error(`cell ${label} has no outline in arrow_boundaries`);

  let why;
  if (plane != null) {
    plane = Math.trunc(plane);
    why = 'asked for';
  } else {
    plane = c.z != null ? planeOf(c.z) : null;
    why = 'the plane of the cell centroid';
    if (plane == null || !areas.has(plane)) {
      plane = [...areas.entries()].sort((a, b) => b[1].area - a[1].area)[0][0];
      why = 'the plane where the cell outline is biggest';
    }
  }
  const mine = areas.get(plane) || null;

  const con = new Database(bg.file, { readonly: true, fileMustExist: true });
  try {
    const meta2 = mbtilesMeta(con);
    const cx = c.x != null ? c.x : (mine ? mine.x.reduce((s2, v) => s2 + v, 0) / mine.x.length : meta2.imgW / 2);
    const cy = c.y != null ? c.y : (mine ? mine.y.reduce((s2, v) => s2 + v, 0) / mine.y.length : meta2.imgH / 2);

    let box, plan, polygons = [], ring = null, others = 0;
    if (context) {
      const ratio = meta2.imgW / meta2.imgH;
      let bw, bh;
      if (ratio > 1.5) { bh = meta2.imgH; bw = bh * 1.5; } else { bw = meta2.imgW; bh = bw / 1.5; }
      box = [(meta2.imgW - bw) / 2, (meta2.imgH - bh) / 2, (meta2.imgW + bw) / 2, (meta2.imgH + bh) / 2];
      plan = tilePlan(con, meta2, plane, box, width);
      ring = { x: (cx - box[0]) * plan.scale, y: (cy - box[1]) * plan.scale,
               r: 0.022 * Math.max(plan.outW, plan.outH), stroke: rgba(RED, 1),
               width: Math.max(2, Math.floor(width / 200)) };
    } else {
      const ref = mine || [...areas.values()].sort((a, b) => b.area - a.area)[0];
      const ext = Math.max(Math.max(...ref.x) - Math.min(...ref.x),
                           Math.max(...ref.y) - Math.min(...ref.y), 10);
      const bh = Math.min(4.5 * ext, meta2.imgH);
      const bw = Math.min(1.5 * bh, meta2.imgW);
      const x0 = Math.min(Math.max(cx - bw / 2, 0), meta2.imgW - bw);
      const y0 = Math.min(Math.max(cy - bh / 2, 0), meta2.imgH - bh);
      box = [x0, y0, x0 + bw, y0 + bh];
      plan = tilePlan(con, meta2, plane, box, width);
      const onPlane = await outlinesOnPlane(plane);
      const thin = Math.max(2, Math.floor(width / 300));
      let near;
      const nbrs = neighbours && c.neighbours
        ? new Set(Array.from(c.neighbours, r => toExternal(r))) : null;
      if (nbrs) {
        near = onPlane.filter(r => nbrs.has(r.label));
      } else {
        near = onPlane.filter(r => r.label !== label &&
          Math.max(...r.x) >= box[0] && Math.min(...r.x) <= box[2] &&
          Math.max(...r.y) >= box[1] && Math.min(...r.y) <= box[3]);
      }
      for (const r of near) {
        polygons.push({ pts: toPix(r.x.map((x, i) => [x, r.y[i]]), box, plan.scale),
                        stroke: rgba(BLUE, 1), fill: rgba(BLUE, 0.15), width: thin });
      }
      if (mine) {
        polygons.push({ pts: toPix(mine.x.map((x, i) => [x, mine.y[i]]), box, plan.scale),
                        stroke: rgba(RED, 1), fill: rgba(RED, 0.3), width: thin + 2 });
      }
      others = near.length;
      var nbrsInfo = nbrs ? { nbrs, drawn: new Set(near.map(r => r.label)) } : null;
    }

    const dataUrl = await deps.compose({ ...plan, autocontrast: context, polygons, ring });
    const planeList = [...areas.keys()].sort((a, b) => a - b);
    const info = {
      cell: label,
      picture: context ? 'context, the whole plane with the cell ringed'
        : (typeof nbrsInfo !== 'undefined' && nbrsInfo)
          ? 'close-up, the cell in red and its mrf neighbours in blue'
          : 'close-up, the cell in red and the other cells on the plane in blue',
      plane,
      plane_is: why,
      outline_on_planes: `${planeList[0]} to ${planeList[planeList.length - 1]}`,
      cell_has_outline_on_this_plane: Boolean(mine),
      centroid_xy: [cx, cy],
      bbox: box.map(v => Math.round(v * 10) / 10),
      scale: Math.round(plan.scale * 1000) / 1000,
      other_cells_outlined: others,
      background: bg.name,
      backgrounds_in_this_run: bg.names,
      mbtiles: bg.file,
      image_is: 'stitched from the jpeg tile pyramid by the viewer, a close visual copy of ' +
                'the image, not the raw pixels. Fine to look at, not to measure',
    };
    if (bg.note) info.background_note = bg.note;
    if (typeof nbrsInfo !== 'undefined' && nbrsInfo) {
      info.neighbours = [...nbrsInfo.nbrs];
      info.neighbours_not_on_this_plane = [...nbrsInfo.nbrs].filter(n => !nbrsInfo.drawn.has(n));
    } else if (neighbours && !c.neighbours) {
      info.neighbours_note = 'this run was written before diagnostics.db kept the mrf ' +
        'neighbours, so every cell in the window is outlined instead';
    }
    return finishImage(dataUrl, info, save_as);
  } finally {
    con.close();
  }
}

async function planeImage({ plane = null, bbox = null, width = 1200, channel = null,
                            save_as = null } = {}) {
  const bg = background(channel);
  const con = new Database(bg.file, { readonly: true, fileMustExist: true });
  try {
    const meta2 = mbtilesMeta(con);
    let why;
    if (plane == null) {
      plane = meta2.planes[Math.floor(meta2.planes.length / 2)];
      why = 'the middle plane of the stack';
    } else {
      plane = Math.trunc(plane);
      why = 'asked for';
      if (!meta2.planes.includes(plane)) {
        throw new Error(`no plane ${plane} in ${path.basename(bg.file)}, it has planes ` +
                        `${meta2.planes[0]} to ${meta2.planes[meta2.planes.length - 1]}`);
      }
    }
    let box = [0, 0, meta2.imgW, meta2.imgH];
    if (bbox != null) {
      const [x0, y0, x1, y1] = bbox.map(Number);
      box = [Math.max(x0, 0), Math.max(y0, 0), Math.min(x1, meta2.imgW), Math.min(y1, meta2.imgH)];
    }
    const plan = tilePlan(con, meta2, plane, box, width);
    const dataUrl = await deps.compose({ ...plan, autocontrast: false, polygons: [], ring: null });
    const info = {
      plane,
      plane_is: why,
      planes_in_the_stack: [meta2.planes[0], meta2.planes[meta2.planes.length - 1]],
      image_size: [meta2.imgW, meta2.imgH],
      bbox: box.map(v => Math.round(v * 10) / 10),
      scale: Math.round(plan.scale * 1000) / 1000,
      to_place_a_point: 'a point (x, y) of the image is at ((x - bbox[0]) * scale, ' +
                        '(y - bbox[1]) * scale) in this picture',
      background: bg.name,
      backgrounds_in_this_run: bg.names,
      mbtiles: bg.file,
      image_is: 'stitched from the jpeg tile pyramid by the viewer, a close visual copy of ' +
                'the image, not the raw pixels. Fine to look at, not to measure',
    };
    if (bg.note) info.background_note = bg.note;
    return finishImage(dataUrl, info, save_as);
  } finally {
    con.close();
  }
}

// the picture as the tools hand it back, written to save_as too when asked, which
// is how a user in a terminal gets to see it
function finishImage(dataUrl, info, saveAs) {
  const b64 = dataUrl.split(',')[1];
  if (saveAs) {
    const out = path.resolve(String(saveAs).replace(/^~(?=$|\/)/, process.env.HOME || '~'));
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    info.saved_as = out;
  }
  return { __image: { media_type: 'image/png', data: b64 }, info };
}

// the little of the cells table the pictures need
function cellRowLite(label) {
  const row = toInternal(label);
  const got = db().prepare(`SELECT * FROM cells WHERE ${deps.getCellKey()} = ?`).get(row);
  if (!got) throw new Error(`cell ${label} is not in diagnostics.db`);
  return { x: got.x, y: got.y, z: got.z,
           neighbours: got.neighbours ? i32(got.neighbours) : null };
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

module.exports = { init, cell, cellCounts, theta, gamma, spot, gene, neighbours, explainCell, hasSavedScore, docsFromRun,
                   spotsOfClass, countSpotsOfClass,
                   spotsInCell, spotsOfCell, spotRow, cellRow, cellImage, planeImage,
                   classCounts, findCells, metadataTool, calculate,
                   toInternal, toExternal, planeOf };
