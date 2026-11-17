// The four checks on one answered question. Each takes what run.js saved (the
// question entry, the answer, the tool events, the messages) and returns a list
// of problems, empty when the check passed. Only what a script can tell: the
// numbers, the tools, one fact, and the mechanical persona rules. Whether the
// explanation is good is still for a reader.
//
// Dependencies: electron/answerCheck.js for the numbers, electron/tools.js for
// the tool names and to look a fact up.

const answerCheck = require('../../electron/answerCheck');
const tools = require('../../electron/tools');

// 1. every number in the answer came from a tool (the live check, same code)
function numbers(turn) {
  return answerCheck.untraced(turn.answer, turn.messages).map(n => `${n} is not in any tool output`);
}

// 2. the tools the question needs were called: "tools": ["explain_cell"] in
// questions.json, and "explain_spot|open_spot_diagnostics" when either will do.
// A why question answered from general knowledge fails here.
function tools_(question, turn) {
  const called = new Set(turn.events.filter(ev => ev.type === 'tool_call').map(ev => ev.name));
  return (question.tools || [])
    .filter(t => !t.split('|').some(name => called.has(name)))
    .map(t => `${t} was not called`);
}

// 3. the fact: for "cell": 14270 in questions.json the answer must name the class
// the run assigned to that cell, read from the run itself
async function facts(question, turn) {
  if (!question.cell) return [];
  const cell = await tools.call('cell', { label: question.cell });
  const cls = cell.classes && cell.classes[0] && cell.classes[0].class;   // the classes come most likely first
  if (!cls) return [`cell ${question.cell}: no class in the cell tool output`];
  return turn.answer.includes(cls) ? [] : [`the class of cell ${question.cell} is ${cls}, the answer does not say so`];
}

// 4. the persona rules a script can see: no tool names or field names in the
// text, no unit on a log-likelihood, no promise about a rerun
const UNITS = /\bnats?\b|log-likelihood units?/i;
const RERUN = /\bre-?run(ning)?\b|\bif you (ran|run)\b/i;

async function wording(turn) {
  const problems = [];
  const text = turn.answer;
  // a tool name with an underscore is only ever the tool; 'cell' or 'gene' is a word
  for (const t of tools.TOOLS) {
    if (t.name.includes('_') && new RegExp('\\b' + t.name + '\\b').test(text)) problems.push(`names the tool ${t.name}`);
  }
  const settings = await settingNames();
  for (const f of fieldNames(turn.events)) {
    if (!settings.has(f) && new RegExp('\\b' + f + '\\b').test(text)) problems.push(`names the field ${f}`);
  }
  if (UNITS.test(text)) problems.push('puts a unit on a log-likelihood');
  if (RERUN.test(text)) problems.push('talks about a rerun (read it: a promise of what it would give is not allowed)');
  return problems;
}

// the names of the run's settings (max_iter, mrf_beta): the user's own words,
// so an answer may use them. Read once from the run.
let settings = null;
async function settingNames() {
  if (!settings) {
    const info = await tools.call('run_info', {});
    settings = new Set(Object.keys(info.settings || {}));
  }
  return settings;
}

// the snake_case keys of everything the tools returned this turn
function fieldNames(events) {
  const names = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (k.includes('_')) names.add(k); walk(v[k]); }
  };
  for (const ev of events) if (ev.type === 'tool_result') walk(ev.result);
  return names;
}

module.exports = { numbers, tools: tools_, facts, wording };
