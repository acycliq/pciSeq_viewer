// The agent on a fixed set of questions, scored. Each question in questions.json
// goes through the real agent (chat.js: same persona, same tools, same loop),
// the tool calls and the answer are saved, and checks.js scores them. The
// output is a scorecard per model, so a change to the persona or a switch of
// model is compared with numbers rather than by reading answers.
//
// It calls the model's API, so it costs money and is run by hand, not in npm test:
//
//   export ANTHROPIC_API_KEY=...            (or ZAI_API_KEY with --provider zai)
//   npm run test:eval -- --run /path/to/viewer_data/diagnostics
//
//   --provider anthropic|zai   which API, anthropic by default
//   --model name               the model, the provider's default if left out
//   --repeat N                 how many times each question is asked, 3 by default
//                              (the model answers differently each time)
//   --only 3,7                 question numbers to run, all by default
//   --tool name '{"label":1}'  run one tool by hand, no model: to pick cells and
//                              genes for new questions
//   --rescore                  the checks again on the saved answers of the last
//                              run, no model: after a change to the checks
//
// Everything lands in tests/eval/out/<model>/: one json per question and repeat
// with the events and the answer, and scorecard.json with the totals.
//
// better-sqlite3 is built for Electron, so this runs under Electron's node
// (ELECTRON_RUN_AS_NODE=1), which is what the npm script does. Electron itself
// is stubbed the way the other checks do it; the tools that need the window
// (fly_to_cell, screenshot, ...) answer that they are not available.

const fs = require('fs');
const path = require('path');

const Module = require('module');
const load = Module._load;
Module._load = function (r, ...a) {
  return r === 'electron'
    ? { safeStorage: {}, ipcMain: { handle() {}, on() {} }, BrowserWindow: class {}, dialog: {} }
    : load.call(this, r, ...a);
};
const diagnostics = require('../../electron/diagnostics');
const run = require('../../electron/run');
const tools = require('../../electron/tools');
const chat = require('../../electron/chat');
const checks = require('./checks');

const QUESTIONS = path.join(__dirname, 'questions.json');
const OUT = path.join(__dirname, 'out');

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const args = { provider: 'anthropic', model: '', repeat: 3, only: null, run: '', tool: null, rescore: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--provider') { args.provider = v; i++; }
    else if (a === '--model') { args.model = v; i++; }
    else if (a === '--repeat') { args.repeat = Number(v); i++; }
    else if (a === '--only') { args.only = v.split(',').map(Number); i++; }
    else if (a === '--run') { args.run = v; i++; }
    else if (a === '--tool') { args.tool = { name: v, input: JSON.parse(argv[i + 2] || '{}') }; i += 2; }
    else if (a === '--rescore') args.rescore = true;
    else throw new Error('unknown argument ' + a);
  }
  if (!args.run) throw new Error('give the diagnostics folder of the run: --run /path/to/viewer_data/diagnostics');
  return args;
}

// ------------------------------------------------------------------- wiring

// the viewer's main.js does this for the window; here the data side is real and
// the screen side says so
const unavailable = async () => ({ error: 'not available outside the viewer' });

function wire(args) {
  diagnostics.init(null, { get: (k, d) => d });
  diagnostics.openDiagnosticsDatabase(path.join(args.run, 'diagnostics.db'));
  run.init({
    getDb: diagnostics.rawDb, getMeta: diagnostics.getMeta, getCellKey: diagnostics.cellKeyName,
    querySpot: diagnostics.querySpot, compose: unavailable, classColour: () => '#888', geneGlyph: () => null,
  });
  tools.init({
    querySpot: diagnostics.querySpot, queryCell: diagnostics.queryCell, getMeta: diagnostics.getMeta,
    send: () => {}, getAnnotations: () => [], getDataPath: () => path.dirname(args.run),
    getTilesInfo: () => null, existsDir: fs.existsSync,
    flyToCell: unavailable, showAllPlanes: unavailable, viewerState: unavailable, spotFilters: unavailable,
    misreadDisplay: unavailable, mapLayers: unavailable, goToPlane: unavailable, geneCountFilter: unavailable,
    screenshot: unavailable, exportPerClassPngs: unavailable, saveDialog: async () => null,
    writeFile: () => {}, fitAllenRegions: unavailable,
  });
  // the settings the panel keeps in electron-store: the provider and model from
  // the command line, no saved key (so the key comes from the environment)
  const store = {
    get: (k, d) => (k === 'chatProvider' ? args.provider : k.startsWith('chatModel') ? args.model || d : d),
  };
  chat.init({ store, send: (ev) => events.push(ev) });
}

let events = [];

// ---------------------------------------------------------------- one question

async function ask(question) {
  events = [];
  const { text, messages } = await chat.runTurn([{ role: 'user', content: question.q }]);
  const log = events.filter(ev => ev.type === 'tool_call' || ev.type === 'tool_result');
  // retried: the first answer had numbers from no tool and the model was asked again
  const retried = events.some(ev => ev.type === 'unverified' && ev.retry);
  return { q: question.q, answer: text, retried, events: log, messages };
}

async function score(question, turn) {
  return {
    numbers: checks.numbers(turn),
    tools: checks.tools(question, turn),
    facts: await checks.facts(question, turn),
    wording: await checks.wording(turn),
  };
}

// the checks again on answers saved by an earlier run, no model: the way to see
// what a change to checks.js or answerCheck.js does, for free
async function rescore(questions, outDir) {
  const rows = [];
  const files = fs.readdirSync(outDir).filter(f => /^q\d+-r\d+\.json$/.test(f));
  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const file of files) {
    const [, q, r] = /^q(\d+)-r(\d+)/.exec(file).map(Number);
    const turn = JSON.parse(fs.readFileSync(path.join(outDir, file), 'utf8'));
    if (turn.error) { rows.push({ question: q, repeat: r, problems: { error: [turn.error] } }); continue; }
    const problems = await score(questions[q - 1], turn);
    const failed = Object.entries(problems).filter(([, p]) => p.length).map(([k, p]) => `${k}: ${p.join('; ')}`);
    process.stdout.write(`q${q} r${r}: ${failed.length ? 'FAIL ' + failed.join(' | ') : 'ok'}\n`);
    fs.writeFileSync(path.join(outDir, file), JSON.stringify({ ...turn, problems }, null, 2));
    rows.push({ question: q, repeat: r, retried: Boolean(turn.retried), problems });
  }
  return rows;
}

// ------------------------------------------------------------------- the run

async function main() {
  const args = parseArgs(process.argv.slice(2));
  wire(args);

  if (args.tool) {
    console.log(JSON.stringify(await tools.call(args.tool.name, args.tool.input), null, 2));
    return;
  }

  const questions = JSON.parse(fs.readFileSync(QUESTIONS, 'utf8'));
  const modelName = chat.getSettings(args.provider).model;
  const outDir = path.join(OUT, modelName.replace(/[^\w.-]/g, '_'));
  fs.mkdirSync(outDir, { recursive: true });

  const rows = [];
  let stopped = false;   // an API error that would fail every question the same way
  for (let i = 0; i < questions.length && !stopped; i++) {
    if (args.rescore) { if (i === 0) rows.push(...await rescore(questions, outDir)); break; }
    if (args.only && !args.only.includes(i + 1)) continue;
    for (let r = 1; r <= args.repeat; r++) {
      process.stdout.write(`q${i + 1} r${r}: ${questions[i].q}\n`);
      let turn, problems;
      try {
        turn = await ask(questions[i]);
        problems = await score(questions[i], turn);
      } catch (e) {
        // a usage limit or a bad key fails every question the same way: stop here
        if ([400, 401, 403].includes(e.status)) { console.error('\nstopped: ' + e.message); stopped = true; break; }
        turn = { q: questions[i].q, answer: '', events: [], error: e.message };
        problems = { error: [e.message] };
      }
      const failed = Object.entries(problems).filter(([, p]) => p.length).map(([k, p]) => `${k}: ${p.join('; ')}`);
      process.stdout.write((failed.length ? '  FAIL ' + failed.join(' | ') : '  ok') + (turn.retried ? ' (retried)' : '') + '\n');
      fs.writeFileSync(path.join(outDir, `q${i + 1}-r${r}.json`), JSON.stringify({ ...turn, problems }, null, 2));
      rows.push({ question: i + 1, repeat: r, retried: Boolean(turn.retried), problems });
    }
  }

  // the scorecard: per check, how many runs passed, and the failures by question
  const names = ['numbers', 'tools', 'facts', 'wording'];
  const passed = Object.fromEntries(names.map(n => [n, rows.filter(r => r.problems[n] && !r.problems[n].length).length]));
  const retried = rows.filter(r => r.retried).length;
  const card = { model: modelName, provider: args.provider, date: new Date().toISOString(), runs: rows.length, passed, retried, rows };
  fs.writeFileSync(path.join(outDir, 'scorecard.json'), JSON.stringify(card, null, 2));
  console.log(`\n${modelName}, ${rows.length} runs`);
  for (const n of names) console.log(`  ${n.padEnd(8)} ${passed[n]}/${rows.length}`);
  console.log(`  retried  ${retried}/${rows.length}  (first answer had numbers from no tool)`);
  console.log(`saved in ${outDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });
