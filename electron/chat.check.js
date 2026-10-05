// Checks chat.js on its own, in plain node: node electron/chat.check.js
// Today: only the last two pasted images are resent with the conversation.
const assert = require('assert');

const Module = require('module');
const orig = Module._load;
Module._load = function (r, ...a) {
  return r === 'electron' ? { safeStorage: {}, ipcMain: { handle() {} } } : orig.call(this, r, ...a);
};
const { withRecentImages, reply, withoutThinking } = require('./chat');

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

// withoutThinking: a conversation begun under one provider can go on under another
const begun = [
  { role: 'user', content: 'hello' },
  { role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm', signature: 'signed by another model' },
                                 { type: 'tool_use', id: 't1', name: 'cell', input: { label: 5 } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] },
  { role: 'assistant', content: [{ type: 'thinking', thinking: 'only this', signature: 'x' }] },
];
const cleaned = withoutThinking(begun);
assert.deepStrictEqual(cleaned[1].content.map(b => b.type), ['tool_use'], 'the thinking is gone, the tool call stays');
assert.deepStrictEqual(cleaned[3].content, [{ type: 'text', text: '(no answer)' }], 'never an empty turn');
assert.strictEqual(cleaned[0], begun[0]);
assert.strictEqual(cleaned[2], begun[2], 'user turns untouched');
assert.strictEqual(begun[1].content.length, 2, 'the stored conversation is not changed');

// reply: the text goes out piece by piece, and the whole reply comes back at the end
(async () => {
  const whole = { content: [{ type: 'text', text: 'one two' }], stop_reason: 'end_turn' };
  const streaming = { messages: {
    stream: () => {
      const on = {};
      return { on: (name, fn) => { on[name] = fn; },
               finalMessage: async () => { on.text('one ', 'one '); on.text('two', 'one two'); return whole; } };
    },
    create: async () => { throw new Error('create must not be called when the stream works'); },
  } };
  const pieces = [];
  assert.strictEqual(await reply(streaming, {}, p => pieces.push(p)), whole);
  assert.deepStrictEqual(pieces, ['one ', 'two']);

  // a service that cannot stream: asked again in one piece
  const noStream = { messages: {
    stream: () => ({ on: () => {}, finalMessage: async () => { throw new Error('no streaming here'); } }),
    create: async () => whole,
  } };
  assert.strictEqual(await reply(noStream, {}, () => {}), whole);

  // it broke after text was shown: do not ask again, the user would see it twice
  const halfWay = { messages: {
    stream: () => {
      const on = {};
      return { on: (name, fn) => { on[name] = fn; },
               finalMessage: async () => { on.text('one ', 'one '); throw new Error('the line dropped'); } };
    },
    create: async () => { throw new Error('create must not be called after text was shown'); },
  } };
  await assert.rejects(reply(halfWay, {}, () => {}), /the line dropped/);

  console.log('chat.check: all assertions pass');
})().catch((e) => { console.error(e); process.exit(1); });
