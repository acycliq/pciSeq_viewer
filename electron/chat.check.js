// Checks chat.js on its own, in plain node: node electron/chat.check.js
// Today: only the last two pasted images are resent with the conversation.
const assert = require('assert');

const Module = require('module');
const orig = Module._load;
Module._load = function (r, ...a) {
  return r === 'electron' ? { safeStorage: {}, ipcMain: { handle() {} } } : orig.call(this, r, ...a);
};
const { withRecentImages } = require('./chat');

const img = n => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x' + n } });
const history = [
  { role: 'user', content: [img(1), { type: 'text', text: 'first' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
  { role: 'user', content: [img(2), { type: 'text', text: 'second' }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'r' }] },
  { role: 'user', content: [img(3), { type: 'text', text: 'third' }] },
];
const out = withRecentImages(history);
assert.strictEqual(out[0].content[0].type, 'text', 'the oldest image is left out');
assert.ok(/pasted earlier/.test(out[0].content[0].text));
assert.strictEqual(out[2].content[0].source.data, 'x2', 'the last two are kept');
assert.strictEqual(out[4].content[0].source.data, 'x3');
assert.deepStrictEqual(out[3], history[3], 'tool results untouched');
assert.strictEqual(history[0].content[0].type, 'image', 'the stored history is not changed');
assert.deepStrictEqual(withRecentImages([{ role: 'user', content: 'plain text' }]), [{ role: 'user', content: 'plain text' }]);

console.log('chat.check: all assertions pass');
