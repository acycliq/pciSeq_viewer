// Proves the persona was lifted whole: SHARED_SYSTEM in chat.js against the python
// MCP server's INSTRUCTIONS, sentence by sentence. A change on one side must be
// made on the other too, and this is the check that catches a miss.
//
// Run from the viewer repo, with the pciSeq env's python on the path or given:
//   node electron/persona.check.js [path/to/pciSeq_3d] [python]
const { execFileSync } = require('child_process');
const path = require('path');

const Module = require('module');
const orig = Module._load;
Module._load = function (r, ...a) {
  return r === 'electron'
    ? { safeStorage: {}, ipcMain: { handle() {} } }
    : orig.call(this, r, ...a);
};
const chat = require('./chat');

const repo = process.argv[2] || path.resolve(__dirname, '../../../python/pciSeq_3d');
const python = process.argv[3] || '/home/dimitris/mambaforge/envs/pciSeq/bin/python';
const py = execFileSync(python, ['-c', 'from pciSeq.src.mcp.server import INSTRUCTIONS; print(INSTRUCTIONS)'],
                        { env: { ...process.env, PYTHONPATH: repo }, encoding: 'utf8' });

// whitespace is layout, sentences are the content
const norm = t => t.replace(/\s+/g, ' ').trim();
const sentences = t => norm(t).split(/(?<=[.?])\s+(?=[A-Z"'])/);

// the one sentence that is the server's own: the viewer opens the run itself
const SERVER_ONLY = [/^Call open_run first/];

const js = new Set(sentences(chat.SHARED_SYSTEM));
const missing = sentences(py).filter(s => !js.has(s) && !SERVER_ONLY.some(re => re.test(s)));
const extra = [...js].filter(s => !sentences(py).includes(s));

if (missing.length || extra.length) {
  for (const s of missing) console.error('LOST from the viewer: ' + s);
  for (const s of extra) console.error('only in the viewer: ' + s);
  process.exit(1);
}
console.log('persona.check: SHARED_SYSTEM carries every sentence of the python INSTRUCTIONS');
