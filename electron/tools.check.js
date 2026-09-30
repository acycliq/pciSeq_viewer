// Runs the tool adapters in plain node on fake query results shaped like the real
// querySpot / queryCell output, so the reshaping and the dispatch can be checked
// without Electron or a database.
const assert = require('assert');
const tools = require('./tools');

// ---- a spot, shaped like querySpot's result
const spotRes = {
  success: true, spotId: 1642419, geneName: 'Synpr', x: 5506, y: 772, z: 152,
  neighborLabels: ['Cell 18223', 'Cell 21574', 'Cell 17371', 'Background'],
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
  assert.strictEqual(cell.sum_favouring_assigned, 13.0);
  assert.strictEqual(cell.sum_favouring_compared, -2.0);
  assert.ok(cell.narrative.startsWith('Cell 42 was called B, with probability 0.90'));
  assert.ok(/So the genes settled it/.test(cell.narrative));

  const same = await tools.call('explain_cell', { label: 42, vs_class: 'B' });
  assert.ok(/already B/.test(same.error));

  const fly = await tools.call('fly_to_cell', { label: 18223 });
  assert.deepStrictEqual(sent, [['chat-fly-to-cell', { label: 18223 }]]);
  assert.strictEqual(fly.done, true);

  // open_cell_diagnostics: same numbers as explain_cell, plus the message to the renderer
  sent = [];
  const opened = await tools.call('open_cell_diagnostics', { label: 42 });
  assert.deepStrictEqual(sent, [['chat-open-cell-diagnostics', { label: 42, vs_class: 'C' }]]);
  assert.strictEqual(opened.compared_with, 'C');
  assert.ok(/open on cell 42, B against C/.test(opened.diagnostics));
  assert.strictEqual(opened.narrative, cell.narrative);

  // a tiny runner up is still a runner up: open against it, do not ask (cell 2413 on
  // espio, 2026-09-28, where the old 0.0005 cut refused)
  sent = [];
  const tiny = u => ({ ...fakeQueryCell(43, u), classProb: [0.0, 1.0, 0.0004] });
  tools.init({ queryCell: async (l, u) => tiny(u) });
  const tinyOpened = await tools.call('open_cell_diagnostics', { label: 43 });
  assert.strictEqual(tinyOpened.compared_with, 'C', tinyOpened.error);
  assert.deepStrictEqual(sent, [['chat-open-cell-diagnostics', { label: 43, vs_class: 'C' }]]);
  const tinyExplained = await tools.call('explain_cell', { label: 43 });
  assert.strictEqual(tinyExplained.compared_with, 'C', 'the same runner up as explain_cell');

  // no runner up at all: no other class has any probability, so ask rather than pick
  sent = [];
  const sure = u => ({ ...fakeQueryCell(44, u), classProb: [0.0, 1.0, 0.0] });
  tools.init({ queryCell: async (l, u) => sure(u) });
  const noRunnerUp = await tools.call('open_cell_diagnostics', { label: 44 });
  assert.ok(/no runner up/.test(noRunnerUp.error), noRunnerUp.error);
  assert.deepStrictEqual(sent, [], 'nothing opened');
  const named = await tools.call('open_cell_diagnostics', { label: 44, vs_class: 'A' });
  assert.strictEqual(named.compared_with, 'A');
  assert.deepStrictEqual(sent, [['chat-open-cell-diagnostics', { label: 44, vs_class: 'A' }]]);
  tools.init({ queryCell: async (l, u) => fakeQueryCell(l, u) });

  const viaCall = await tools.call('explain_spot', { spot_id: 1642419 });
  assert.strictEqual(viaCall.assigned_to, 18223);

  // open_spot_diagnostics: same answer as explain_spot, plus the message to the renderer
  sent = [];
  const spotOpened = await tools.call('open_spot_diagnostics', { spot_id: 1642419 });
  assert.deepStrictEqual(sent, [['chat-open-spot-diagnostics', { spot_id: 1642419 }]]);
  assert.strictEqual(spotOpened.narrative, viaCall.narrative);
  assert.ok(/open on spot 1642419/.test(spotOpened.diagnostics));
  // a spot the db does not have: the error comes back and nothing opens
  sent = [];
  tools.init({ querySpot: async () => ({ success: false, error: 'no spot 7' }) });
  const noSpot = await tools.call('open_spot_diagnostics', { spot_id: 7 });
  assert.strictEqual(noSpot.error, 'no spot 7');
  assert.deepStrictEqual(sent, [], 'nothing opened');
  tools.init({ querySpot: async () => spotRes });

  // show_classes / show_genes: names checked against the run, then one message out
  tools.init({ getMeta: () => ({ class_names: names, gene_panel: ['Npy', 'Sst', 'Vip'] }) });
  sent = [];
  const only = await tools.call('show_classes', { mode: 'only', names: ['A', 'X', 'C'] });
  assert.deepStrictEqual(sent, [['chat-show-visibility', { kind: 'classes', mode: 'only', names: ['A', 'C'] }]]);
  assert.strictEqual(only.shown, 2);
  assert.deepStrictEqual(only.unknown, ['X'], 'the typo is reported, not applied');
  sent = [];
  const hideGene = await tools.call('show_genes', { mode: 'hide', names: ['Sst'] });
  assert.deepStrictEqual(sent, [['chat-show-visibility', { kind: 'genes', mode: 'hide', names: ['Sst'] }]]);
  assert.strictEqual(hideGene.shown, undefined, 'the count is not known after a hide');
  sent = [];
  const allGenes = await tools.call('show_genes', { mode: 'all' });
  assert.deepStrictEqual(sent, [['chat-show-visibility', { kind: 'genes', mode: 'all', names: [] }]]);
  assert.strictEqual(allGenes.shown, 3);
  sent = [];
  assert.ok(/nothing changed/.test((await tools.call('show_classes', { mode: 'add', names: ['X'] })).error));
  assert.ok(/needs the class names/.test((await tools.call('show_classes', { mode: 'only' })).error));
  assert.ok(/mode must be/.test((await tools.call('show_genes', { mode: 'toggle' })).error));
  assert.deepStrictEqual(sent, [], 'nothing sent on a refusal');
  tools.init({ getMeta: () => ({ class_names: names }) });

  // docs: a tiny corpus in a temp folder, the ranking of docs.py
  const fs = require('fs'), os = require('os'), path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pciseq-docs-'));
  fs.writeFileSync(path.join(root, 'index.md'), '# pciSeq\n\nAssigns spots to cells.\n');
  fs.mkdirSync(path.join(root, 'the-model'));
  fs.writeFileSync(path.join(root, 'the-model', 'settings.md'),
    '---\ndescription: The settings\n---\n\n## rTheta\n\nrTheta is the shape of the gamma prior on the cell ' +
    'scale factor theta.\n\n## mrf_beta\n\nmrf_beta is the strength of the spatial term.\n\n' +
    '## Where\n\n| Quantity | Code |\n|---|---|\n| theta | `main.py` `theta_upd` line 831 |\n| rho | `main.py` `rho_upd` line 653 |\n');
  tools.init({ docsRoot: root });
  const found = await tools.call('docs', { query: 'rTheta' });
  assert.strictEqual(found.hits.length, 1);
  assert.strictEqual(found.hits[0].page, 'the-model/settings.md');
  assert.strictEqual(found.hits[0].heading, 'rTheta');
  assert.strictEqual(found.hits[0].title, 'The settings');
  // a table comes back one row at a time, with its heading
  const row = await tools.call('docs', { query: 'rho_upd' });
  assert.strictEqual(row.hits.length, 1);
  assert.strictEqual(row.hits[0].heading, 'Where');
  assert.strictEqual(row.hits[0].text, '| rho | `main.py` `rho_upd` line 653 |');
  // prose before a row on a tie
  const tie = await tools.call('docs', { query: 'theta' });
  assert.ok(!tie.hits[0].text.startsWith('|'), tie.hits[0].text);
  const nothing = await tools.call('docs', { query: 'zzzz' });
  assert.deepStrictEqual(nothing.hits, []);
  assert.deepStrictEqual(nothing.pages, ['index.md', 'the-model/settings.md']);
  // the pages saved inside the run win, and GitHub is not asked at all
  const run = require('./run');
  const realDocsFromRun = run.docsFromRun;
  let githubCalls = 0;
  run.docsFromRun = () => new Map([['index.md', '# pciSeq\n\nThe mrf_beta of the run.\n']]);
  tools.init({ fetch: async () => { githubCalls++; throw new Error('offline'); } });
  const saved = await tools.call('docs', { query: 'mrf_beta' });
  assert.strictEqual(saved.hits.length, 1);
  assert.strictEqual(saved.hits[0].page, 'index.md');
  assert.ok(/saved inside this run/.test(saved.docs_are), saved.docs_are);
  assert.strictEqual(githubCalls, 0, 'no GitHub fetch when the run has its docs');
  // a run without the table: back to the old order, here the viewer's copy
  run.docsFromRun = () => null;
  const older = await tools.call('docs', { query: 'mrf_beta' });
  assert.strictEqual(older.hits[0].page, 'the-model/settings.md');
  assert.ok(/shipped with this viewer/.test(older.docs_are), older.docs_are);
  run.docsFromRun = realDocsFromRun;
  tools.init({ fetch: null });

  fs.rmSync(root, { recursive: true });
  tools.init({ docsRoot: null });
  assert.ok(/no documentation/.test((await tools.call('docs', { query: 'x' })).error));

  // the legend: the window sends it, the tools read one class or one gene
  const legend = require('./legend');
  let onLegend = null;
  legend.init({ on: (ch, fn) => { assert.strictEqual(ch, 'legend'); onLegend = fn; } });
  assert.strictEqual(legend.classColour('CA1'), null, 'nothing before the window sends');
  onLegend(null, { classes: { CA1: '#1f77b4' }, genes: { Rgs12: { colour: '#ff0000', shape: 'diamond' } } });
  assert.strictEqual(legend.classColour('CA1'), '#1f77b4');
  assert.strictEqual(legend.classColour('CA9'), null);
  assert.deepStrictEqual(legend.geneGlyph('Rgs12'), { colour: '#ff0000', shape: 'diamond' });
  assert.strictEqual(legend.geneGlyph('Npy'), null);

  // theta_bar: the assigned class by default, any class by name; cell says the same
  // number and the class colour. A one-row fake of diagnostics.db.
  const run2 = require('./run');
  const blob = a => Buffer.from(new Float32Array(a).buffer);
  const cellRowFake = { assigned_class_idx: 1, class_prob: blob([0.1, 0.8, 0.1]),
    gene_count: blob([2, 3]), theta_bar: blob([0.5, 1.7, 0.9]), gamma_assigned: blob([1, 1]),
    mrf: null, neighbours: null, x: 1, y: 2, z: 3 };
  run2.init({ getDb: () => ({ prepare: () => ({ get: () => cellRowFake }) }),
              getMeta: () => ({ class_names: ['A', 'B', 'C'], gene_panel: ['g1', 'g2'] }),
              getCellKey: () => 'cell_key', classColour: n => (n === 'B' ? '#112233' : null),
              geneGlyph: g => (g === 'Synpr' ? { colour: '#00ff00', shape: 'square' } : null),
              querySpot: async () => spotRes });
  const th = run2.theta(5);
  assert.strictEqual(th.class, 'B');
  assert.strictEqual(th.is_assigned, true);
  assert.strictEqual(th.theta_bar, Math.fround(1.7));
  assert.strictEqual(th.theta, undefined, 'the averaged theta is gone');
  const thC = run2.theta(5, 'C');
  assert.strictEqual(thC.theta_bar, Math.fround(0.9));
  assert.strictEqual(thC.is_assigned, false);
  assert.throws(() => run2.theta(5, 'X'), /no class 'X'/);
  const cl = run2.cell(5);
  assert.strictEqual(cl.theta_bar, Math.fround(1.7), 'cell gives the tooltip value');
  assert.strictEqual(cl.colour, '#112233');
  const sp = await run2.spot(1642419);
  assert.strictEqual(sp.glyph.shape, 'square');
  assert.strictEqual(sp.glyph.colour, '#00ff00');
  run2.init({ geneGlyph: () => null });
  assert.strictEqual((await run2.spot(1642419)).glyph, null, 'null when the window has not said');
  run2.init({ getDb: null, getMeta: null, getCellKey: null, classColour: null, geneGlyph: null, querySpot: null });

  // allen: which experiment to show, on Plp1's real list (2026-09-30), offline
  const allen = require('./allen');
  const plp1 = [
    { id: 75496529, plane: 'sagittal', control: false, delegate: true },
    { id: 69117382, plane: 'sagittal', control: false, delegate: false },
    { id: 79556704, plane: 'coronal', control: false, delegate: false },
    { id: 813, plane: 'sagittal', control: true, delegate: false },
  ];
  assert.strictEqual(allen.pick(plp1, null, null).chosen.id, 79556704, 'coronal when no plane is asked');
  assert.strictEqual(allen.pick(plp1, 'sagittal', null).chosen.id, 75496529, "Allen's delegate");
  assert.strictEqual(allen.pick(plp1, 'coronal', null).chosen.id, 79556704);
  assert.strictEqual(allen.pick(plp1, null, 813).chosen.id, 813, 'a named experiment wins, even a control');
  assert.throws(() => allen.pick(plp1, null, 1), /not one of this gene's/);
  const sagOnly = plp1.filter(e => e.plane === 'sagittal');
  const noCoronal = allen.pick(sagOnly, 'coronal', null);
  assert.strictEqual(noCoronal.chosen.plane, 'sagittal');
  assert.ok(/no coronal experiment/.test(noCoronal.note), noCoronal.note);
  assert.ok(!allen.pick(sagOnly, null, null).chosen.control, 'never a sense probe by default');
  assert.throws(() => allen.pick([plp1[3]], null, null), /no antisense/);

  // run_info: from the metadata, old runs say so
  const meta = { nC: 17, nS: 500, nG: 20, nK: 3,
                 pciSeq_provenance: { version: '0.1', commit: 'abc1234', branch: 'dev_3d', created_at: '2026-09-26T10:00:00Z' },
                 config: { rTheta: 2, CellCallTolerance: 0.02, is3D: true, voxel_size: [1, 1, 3] },
                 run: { iterations: 40, converged: true, delta: [0.5, 0.01] } };
  tools.init({ getMeta: () => meta });
  const info = await tools.call('run_info', {});
  assert.strictEqual(info.cells, 16);
  assert.strictEqual(info.run_date, '2026-09-26T10:00:00Z');
  assert.strictEqual(info.settings.rTheta, 2);
  assert.ok(/converged after 40 iterations/.test(info.ended));
  tools.init({ getMeta: () => ({ nC: 17, nS: 500, nG: 20, nK: 3, pciSeq_provenance: { version: '0.0.9' } }) });
  const old = await tools.call('run_info', {});
  assert.strictEqual(old.settings, null);
  assert.ok(/before pciSeq exported/.test(old.note));

  // the source: fetched at the run's commit, sliced, line numbered
  const fetched = [];
  const fakeFetch = async (url) => {
    fetched.push(url);
    if (url.includes('/contents/')) {
      return { ok: true, status: 200, text: async () => JSON.stringify([
        { name: 'core', type: 'dir', size: 0 }, { name: 'setup.py', type: 'file', size: 10 }]) };
    }
    if (url.endsWith('/missing.py')) return { ok: false, status: 404, text: async () => '' };
    const body = Array.from({ length: 1000 }, (_, i) => 'line ' + (i + 1)).join('\n');
    return { ok: true, status: 200, text: async () => body };
  };
  tools.init({ getMeta: () => meta, fetch: fakeFetch });
  const listed = await tools.call('list_source', { dir: 'pciSeq/src' });
  assert.ok(fetched[0].endsWith('/contents/pciSeq/src?ref=abc1234'), fetched[0]);
  assert.deepStrictEqual(listed.entries.map(e => e.type), ['dir', 'file']);
  const src = await tools.call('read_source', { path: 'pciSeq/src/core/main.py' });
  assert.ok(fetched[1].endsWith('/abc1234/pciSeq/src/core/main.py'), fetched[1]);
  assert.strictEqual(src.lines, 1000);
  assert.strictEqual(src.end, 400);
  assert.ok(src.text.startsWith('   1  line 1'));
  assert.ok(/start_line=401/.test(src.next));
  const tail = await tools.call('read_source', { path: 'pciSeq/src/core/main.py', start_line: 900 });
  assert.strictEqual(tail.end, 1000);
  assert.strictEqual(tail.next, undefined);
  assert.ok(/not found on GitHub/.test((await tools.call('read_source', { path: 'missing.py' })).error));
  assert.ok(/not a path inside/.test((await tools.call('read_source', { path: '../etc/passwd' })).error));

  // two functions of the same name in one module: the later silently wins, and
  // every earlier caller gets the wrong one. That happened with cellRow, and node
  // --check cannot see it. Catch it here for the modules the tools lean on.
  const fs2 = require('fs'), path2 = require('path');
  for (const mod of ['run.js', 'tools.js', 'docs.js', 'chat.js']) {
    const src = fs2.readFileSync(path2.join(__dirname, mod), 'utf8');
    const names = [...src.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepStrictEqual(dupes, [], `${mod} defines these twice: ${dupes.join(', ')}`);
  }

  const bad = await tools.call('no_such_tool', {});
  assert.ok(/unknown tool/.test(bad.error));
  console.log('tools.check: all assertions pass');
})().catch(e => { console.error('tools.check FAILED:', e.message); process.exit(1); });
