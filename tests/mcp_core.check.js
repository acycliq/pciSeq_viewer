// What the viewer's MCP server sends must reach the model whole. Claude Code cuts a
// server's instructions at 4,096 characters and a tool description at 4,096 when it
// loads it up front, and the model never sees what is past the cut. So: the core
// stays under 4,000, every sentence in it is copied word for word from the persona
// the built-in chat runs on (chat.SYSTEM), and every tool description stays under
// 4,000. Plain ASCII throughout, so there is no doubt how the characters are counted.

const { test } = require('node:test');
const assert = require('assert');
const Module = require('module');
const load = Module._load;
Module._load = function (r, ...a) {
  return r === 'electron'
    ? { safeStorage: {}, ipcMain: { handle() {}, on() {} }, app: { getPath: () => '/tmp', on() {} }, BrowserWindow: function () {} }
    : load.call(this, r, ...a);
};
const { CORE, TOOL_RULES, toolRules, listed } = require('../electron/mcp-server');
const chat = require('../electron/chat');
const tools = require('../electron/tools');

const norm = t => t.replace(/\s+/g, ' ').trim();

test('the core is short enough never to be cut, and plain ASCII', () => {
  assert.ok(CORE.length < 4000, `core is ${CORE.length} characters`);
  assert.ok(/^[\x00-\x7f]*$/.test(CORE), 'core has non-ASCII characters');
});

test('every sentence of the core is in the persona word for word', () => {
  const full = norm(chat.SYSTEM);
  // the first paragraph is the server's own: it says the agent is outside the viewer
  const paragraphs = CORE.split('\n\n').slice(1);
  const sentences = paragraphs.flatMap(p => p.split(/(?<=[.;])\s+(?=[A-Z"])/));
  assert.ok(sentences.length > 20);
  const missing = sentences.filter(x => !full.includes(norm(x)));
  assert.deepStrictEqual(missing, []);
});

test('no tool description is long enough to be cut, rules included', () => {
  for (const t of tools.TOOLS) {
    const d = listed(t).description;
    assert.ok(d.length < 4000, `${t.name}: ${d.length}`);
  }
});

test('the tool rules are the persona\'s own words and sit on their tools', () => {
  const full = norm(chat.SYSTEM);
  const names = new Set(tools.TOOLS.map(t => t.name));
  for (const [name, passages] of Object.entries(TOOL_RULES)) {
    assert.ok(names.has(name), `no tool ${name}`);
    for (const [start, end] of passages) {
      const i = full.indexOf(start);
      assert.ok(i >= 0 && full.indexOf(end, i) >= 0, `${name}: ${start} ... ${end}`);
    }
    const t = tools.TOOLS.find(x => x.name === name);
    assert.ok(listed(t).description.includes(toolRules(name)), name);
  }
});
