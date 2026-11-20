// Checks chatLog.js on its own, in plain node: node tests/chatLog.check.js
// A question becomes one line of JSON in the log file, with its rounds and tokens.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const chatLog = require('../electron/chatLog');

// the question is the text of the last message, cut short, without a pasted image
const pasted = [
  { role: 'user', content: 'an earlier question' },
  { role: 'assistant', content: [{ type: 'text', text: 'an answer' }] },
  { role: 'user', content: [{ type: 'image', source: {} }, { type: 'text', text: 'why is cell 12 a Pvalb cell?' }] },
];
const record = chatLog.newRecord(pasted);
assert.strictEqual(record.question, 'why is cell 12 a Pvalb cell?');
assert.strictEqual(chatLog.newRecord([{ role: 'user', content: 'x'.repeat(500) }]).question.length, 200);

// every reply is a round, and its tokens are added up
chatLog.countReply(record, { usage: { input_tokens: 1000, output_tokens: 50 } });
chatLog.countReply(record, { usage: { input_tokens: 1200, output_tokens: 300 } });
assert.strictEqual(record.rounds, 2);
assert.strictEqual(record.input_tokens, 2200);
assert.strictEqual(record.output_tokens, 350);
assert.strictEqual(record.tokens_reported, true);

// a reply without token counts is still a round, and the record says the sums are short
chatLog.countReply(record, {});
assert.strictEqual(record.rounds, 3);
assert.strictEqual(record.input_tokens, 2200);
assert.strictEqual(record.tokens_reported, false);

// write adds one line per record, and each line reads back as the record
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chatlog-')), 'chat-log.jsonl');
chatLog.write(file, record);
chatLog.write(file, chatLog.newRecord([{ role: 'user', content: 'a second question' }]));
const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
assert.strictEqual(lines.length, 2);
assert.strictEqual(lines[0].rounds, 3);
assert.strictEqual(lines[1].question, 'a second question');
assert.ok(lines[0].seconds >= 0);

// no file given: nothing is written and nothing breaks
chatLog.write(null, record);

// a file that cannot be written must not throw, the answer matters more than the log
const warn = console.warn;
const warnings = [];
console.warn = (...args) => warnings.push(args.join(' '));
chatLog.write(path.join(file, 'not-a-folder', 'x.jsonl'), record);
console.warn = warn;
assert.ok(/chat log not written/.test(warnings[0]));

console.log('chatLog.check: all assertions pass');
