// The cell and spot queries on a diagnostics.db in format 1 and in format 2, with
// the same numbers in both, so the two must answer alike. A tiny run is written to
// two temporary files the way export_diagnostics lays them out (pciSeq_3d,
// pciSeq/src/core/io/diagnostics_db.py): 3 genes, 2 classes, 2 cells, 3 spots,
// 2 candidate cells plus the background per spot. better-sqlite3 is built for
// Electron, so this runs under its node:
//   ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron tests/diagnostics.check.js
const Module = require('module');
const load = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'electron') return { ipcMain: { handle() {} }, BrowserWindow: class {}, dialog: {} };
  return load.call(this, req, ...rest);
};
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const diag = require('../electron/diagnostics');

const nG = 3, nK = 2, nN = 3;
const genes = ['Plp1', 'Gad1', 'Npy'], classes = ['Oligo', 'Zero'];
const f32 = a => Buffer.from(Float32Array.from(a).buffer);
const i32 = a => Buffer.from(Int32Array.from(a).buffer);
// the run: the matrix the likelihood scores against, a factor per cell, and the
// per gene log eta
const mAdj = [[2.0, 0.0], [0.5, 0.0], [0.1, 0.0]];           // (nG, nK)
const areaFactor = [1.0, 0.8, 1.3];                           // row 0 is the background
const logeta = [-0.137, 0.42, -1.1];
const etaBar = [0.87, 1.5, 0.33];
const cells = [
  // internal_label, theta_bar, gene_count, class_prob, theta, assigned, mrf
  [0, [1, 1], [0, 0, 0], [0, 1], 1, 1, [0, 0]],
  [1, [1.2, 1.0], [18.1, 0.5, 0.0], [0.97, 0.03], 1.19, 0, [0.4, 0.0]],
  [2, [0.6, 1.0], [0.3, 4.2, 1.0], [0.2, 0.8], 0.68, 1, [0.0, 0.1]],
];
const spots = [
  // spot_id, gene_idx, x, y, z, ids (cells, background last), 4 terms per candidate
  [10, 0, 100, 200, 30, [1, 2, 0], [-11.2, -14.5], [-2.0, 0.27], [0.17, -0.13], [-0.05, 0.06]],
  [11, 1, 101, 201, 31, [2, 1, 0], [-9.9, -16.1], [0.3, -1.8], [-0.2, 0.1], [0.4, -0.9]],
  [12, 2, 102, 202, 32, [1, 2, 0], [-20.0, -21.0], [-2.1, -2.1], [0.0, 0.0], [0.5, 0.5]],
];
const logRhoBar = { Plp1: -14.0, Gad1: -15.0, Npy: -13.0 };
const meta = {
  nC: '3', nG: String(nG), nK: String(nK), nN: String(nN), nS: '3', rSpot: '2', SpotReg: '0.1',
  class_names: JSON.stringify(classes), gene_panel: JSON.stringify(genes),
  eta_bar: JSON.stringify(etaBar), log_prior: JSON.stringify([-0.7, -0.7]),
  sc_mean_expression: JSON.stringify(mAdj.map(r => r.map(v => v / 0.1))),
  mean_gene_reads_per_class: JSON.stringify([[16.2, 0.1], [0.4, 3.9], [0.2, 0.8]]),
  log_rho_bar: JSON.stringify(logRhoBar), misread_density: JSON.stringify({}), label_map: JSON.stringify({}),
  config: JSON.stringify({ Inefficiency: 0.1, InsideCellBonus: 0 }),
};

function write(format, file) {
  const db = new Database(file);
  db.exec('CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT)');
  const m = { ...meta, format_version: String(format) };
  if (format === 2) { m.mean_expression_adj = JSON.stringify(mAdj); m.logeta_bar = JSON.stringify(logeta); }
  const ins = db.prepare('INSERT INTO metadata VALUES (?, ?)');
  for (const [k, v] of Object.entries(m)) ins.run(k, v);
  db.exec(`CREATE TABLE cells (internal_label INTEGER PRIMARY KEY, ${format === 2 ? 'area_factor REAL' : 'scaled_means BLOB'},
           theta_bar BLOB, gene_count BLOB, class_prob BLOB, theta REAL, assigned_class_idx INTEGER, mrf BLOB)`);
  const ic = db.prepare('INSERT INTO cells VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const [c, tb, gc, cp, th, a, mrf] of cells) {
    const scaled = format === 2 ? areaFactor[c] : f32(mAdj.flat().map(v => Math.fround(v * areaFactor[c])));
    ic.run(c, scaled, f32(tb), f32(gc), f32(cp), th, a, f32(mrf));
  }
  db.exec(`CREATE TABLE spots (spot_id INTEGER PRIMARY KEY, gene_idx INTEGER, x INTEGER, y INTEGER, z INTEGER,
           neighbor_cell_ids ${format === 2 ? 'BLOB' : 'TEXT'}, mvn_loglik BLOB, attention BLOB, expr_fluct BLOB,
           cell_inefficiency BLOB${format === 2 ? '' : ', gene_inefficiency BLOB, bonus BLOB'})`);
  const is = db.prepare(`INSERT INTO spots VALUES (${format === 2 ? '?,?,?,?,?,?,?,?,?,?' : '?,?,?,?,?,?,?,?,?,?,?,?'})`);
  for (const [sid, g, x, y, z, ids, mvn, att, expr, cin] of spots) {
    if (format === 2) {
      is.run(sid, g, x, y, z, i32(ids.slice(0, -1)), f32(mvn), f32(att), f32(expr), f32(cin));
    } else {
      // format 1: the background slot, zero, on every blob; the gene term ten times
      // over; a bonus of zeros
      const pad = a => f32([...a, 0]);
      is.run(sid, g, x, y, z, JSON.stringify(ids), pad(mvn), pad(att), pad(expr), pad(cin),
             pad([logeta[g], logeta[g]]), f32([0, 0, 0]));
    }
  }
  db.exec('CREATE TABLE docs (page TEXT PRIMARY KEY, text TEXT)');
  db.close();
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pciseq-diag-'));
const files = { 1: path.join(dir, 'v1.db'), 2: path.join(dir, 'v2.db') };
write(1, files[1]);
write(2, files[2]);

const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a)), `${what}: ${a} vs ${b}`);
const got = {};
(async () => {
  for (const v of [1, 2]) {
    const m = diag.openDiagnosticsDatabase(files[v]);
    assert.strictEqual(Number(m.format_version), v);
    got[v] = {
      cell1: await diag.queryCell(1, 'Zero', 3),
      cell2: await diag.queryCell(2, 'Oligo', 3),
      spots: await Promise.all(spots.map(s => diag.querySpot(s[0]))),
    };
    diag.closeDiagnosticsDatabase();
  }
  // the cell inspector: the same gene contributions and the same posterior
  for (const k of ['cell1', 'cell2']) {
    const a = got[1][k], b = got[2][k];
    assert.ok(a.success && b.success, k + ': ' + (a.error || b.error));
    assert.strictEqual(a.assignedClass, b.assignedClass);
    assert.strictEqual(a.allData.length, nG);
    for (let g = 0; g < nG; g++) {
      assert.strictEqual(a.allData[g].gene, b.allData[g].gene);
      near(a.allData[g].diff, b.allData[g].diff, k + ' diff ' + genes[g]);
    }
    for (const t of ['geneLoglikAssigned', 'geneLoglikUser', 'mrfAssigned', 'mrfUser']) near(a.components[t], b.components[t], k + ' ' + t);
    if (a.posterior) for (let i = 0; i < nK; i++) near(a.posterior[i], b.posterior[i], k + ' posterior ' + i);
  }
  // the spot inspector: the same candidates, terms, scores and probabilities, and
  // in format 2 the gene term comes from logeta_bar and the bonus is zero
  for (let i = 0; i < spots.length; i++) {
    const a = got[1].spots[i], b = got[2].spots[i];
    assert.ok(a.success && b.success, 'spot ' + spots[i][0] + ': ' + (a.error || b.error));
    assert.deepStrictEqual(b.neighborIds, spots[i][5].slice(0, -1));
    assert.deepStrictEqual(a.neighborIds, b.neighborIds);
    assert.deepStrictEqual(a.neighborLabels, b.neighborLabels);
    for (const t of ['mvn', 'attention', 'exprFluct', 'cellInefficiency', 'geneInefficiency', 'bonus', 'scores', 'probabilities']) {
      assert.strictEqual(a[t].length, b[t].length, t);
      for (let j = 0; j < a[t].length; j++) near(a[t][j], b[t][j], `spot ${spots[i][0]} ${t}[${j}]`);
    }
    near(b.geneInefficiency[0], logeta[spots[i][1]], 'logeta_bar of the gene');
    assert.ok(b.bonus.every(x => x === 0));
    near(b.misread, logRhoBar[genes[spots[i][1]]], 'misread');
    near(b.probabilities.reduce((s, x) => s + x, 0), 1, 'probabilities sum');
  }
  // a format 2 file that lacks what format 2 moved to the metadata is refused
  const bad = path.join(dir, 'bad.db');
  write(2, bad);
  const db = new Database(bad);
  db.prepare("DELETE FROM metadata WHERE key = 'logeta_bar'").run();
  db.close();
  assert.throws(() => diag.openDiagnosticsDatabase(bad), /logeta_bar/);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('diagnostics.check.js: format 1 and format 2 answer alike, ok');
})().catch(e => { console.error(e); process.exit(1); });
