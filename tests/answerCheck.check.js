// answerCheck on made up answers: numbers the tools returned pass, rounded or as
// a percentage, and numbers from nowhere are reported. Plain node.
const { test } = require('node:test');
const assert = require('assert');
const { numbersIn, allowed, untraced, retryNote } = require('../electron/answerCheck');

// a turn the way chat.js keeps it: the question, the model's tool call, the result
const messages = [
  { role: 'user', content: 'Why is cell 14270 an oligodendrocyte?' },
  { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'explain_cell', input: { label: 14270 } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1',
    content: JSON.stringify({ label: 14270, class: '037 DG Glut', prob: 0.7372, genes: [{ gene: 'Plp1', diff: -12.2847 }] }) }] },
];

test('numbersIn reads numbers as written and leaves names alone', () => {
  const n = numbersIn('Plp1 contributes 12.3, cell 14270, 1,234 spots, 2e-3, CA1, 7.4 x 10^-20, 1.34 x 10^19, of the order of 10^-20, 10-20 spots');
  assert.deepStrictEqual(n.map(x => x.text), ['12.3', '14270', '1,234', '2e-3', '7.4e-20', '1.34e19', '1e-20', '10', '20']);
  assert.deepStrictEqual(n.map(x => x.value), [12.3, 14270, 1234, 0.002, 7.4e-20, 1.34e19, 1e-20, 10, 20]);
  assert.deepStrictEqual(n.map(x => x.decimals), [1, -1, 0, 3, 21, -17, 20, -1, -1], 'trailing zeros and exponents shift the decimals');
});

test('a bare power of ten claims only the exponent', () => {
  const withTiny = messages.concat([
    { role: 'assistant', content: [{ type: 'tool_use', id: 't4', name: 'cell', input: { label: 20515 } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't4', content: JSON.stringify({ prob: 7.446e-20 }) }] },
  ]);
  assert.deepStrictEqual(untraced('a probability of the order of 10^-20', withTiny), []);
  assert.deepStrictEqual(untraced('a probability of the order of 10^-19', withTiny), ['1e-19']);
  assert.deepStrictEqual(untraced('a probability of about 7.4 x 10^-20', withTiny), []);
  assert.deepStrictEqual(untraced('about 7.4 x 10^(-20), or 7.4 x 10^{-20}', withTiny), []);
  // the multiplication sign, character 215, counts as a sign too
  assert.deepStrictEqual(untraced('about 7.4 ' + String.fromCharCode(215) + ' 10^-20', withTiny), []);
});

test('a superscript exponent is reported as written, not read', () => {
  // characters 8315, 178 and 8304 are the superscript minus, two and zero: 10
  // followed by any such character is flagged, since the persona asks for 1e-20
  const sup = '10' + String.fromCharCode(8315, 178, 8304);   // 10 to the minus 20
  assert.deepStrictEqual(untraced('of the order of ' + sup, messages), [sup]);
  // other characters after a 10 are not exponents: 8211 is the en dash, 215 the
  // multiplication sign, 181 the micro sign
  const plain = '10' + String.fromCharCode(8211) + '20 spots, 10' + String.fromCharCode(215) + ' higher, 10' + String.fromCharCode(181) + 'm';
  assert.deepStrictEqual(untraced(plain, messages), ['20']);
});

test('a typographic minus in the exponent reads as a minus', () => {
  const withTiny = messages.concat([{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"prob": 7.446e-20}' }] }]);
  assert.deepStrictEqual(untraced('about 7.4 x 10^' + String.fromCharCode(8722) + '20', withTiny), []);
});

test('a label is quoted whole, not rounded', () => {
  assert.deepStrictEqual(untraced('cell 20515 is CA2', messages.concat([{ role: 'user', content: 'and cell 20515?' }])), []);
  assert.deepStrictEqual(untraced('cell 20500 is CA2', messages.concat([{ role: 'user', content: 'and cell 20515?' }])), ['20500']);
});

test('an integer rounded to its trailing zeros passes', () => {
  const withOdds = messages.concat([
    { role: 'assistant', content: [{ type: 'tool_use', id: 't3', name: 'calculate', input: { expression: '1/0.0000116' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't3', content: JSON.stringify({ result: 86115.8788 }) }] },
  ]);
  assert.deepStrictEqual(untraced('odds of roughly 86,100 to 1', withOdds), []);
  assert.deepStrictEqual(untraced('odds of roughly 85,000 to 1', withOdds), ['85,000'], 'wrong beyond what the zeros allow');
});

test('allowed holds the question, the tool input and the tool result', () => {
  const pool = allowed(messages);
  assert.ok(pool.includes(14270));
  assert.ok(pool.includes(0.7372));
  assert.ok(pool.includes(12.2847), 'the sign is dropped');
  assert.ok(pool.includes(37), 'the 037 of the class name');
});

test('rounding, percentages and dropped signs pass', () => {
  assert.deepStrictEqual(untraced('Plp1 lowers the odds by 12.3; probability 0.74, that is 74%.', messages), []);
  assert.deepStrictEqual(untraced('about 12 from Plp1, cell 14270, 73.7 percent', messages), []);
});

test('a number from nowhere is reported once, small counts are not', () => {
  assert.deepStrictEqual(untraced('Plp1 gives 12.3 and Mbp gives 9.8, so 22.1 together; 22.1 is a lot', messages),
                         ['9.8', '22.1']);
  assert.deepStrictEqual(untraced('3 of the 4 genes agree, 2 do not', messages), []);
  assert.deepStrictEqual(untraced('it has 11 reads', messages), ['11'], 'counts above ten are checked');
});

test('a list length and a change from 1 pass', () => {
  const withList = messages.concat([
    { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'theta', input: { label: 806 } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2',
      content: JSON.stringify({ theta: 1.131, classes: Array.from({ length: 39 }, (_, i) => ({ k: i })) }) }] },
  ]);
  assert.deepStrictEqual(untraced('39 classes; theta 1.13, so 13% more reads than expected', withList), []);
  assert.deepStrictEqual(untraced('spread over 40 classes', withList), ['40']);
});

test('the retry note names the numbers but is not a source for them', () => {
  const note = retryNote(['22.1', '9.8']);
  assert.ok(note.includes('22.1, 9.8'));
  const withNote = messages.concat([{ role: 'user', content: note }]);
  assert.deepStrictEqual(untraced('so 22.1 together', withNote), ['22.1']);
});

test('assistant text is not a source', () => {
  const withEarlier = messages.concat([{ role: 'assistant', content: [{ type: 'text', text: 'the odds are 99.9' }] }]);
  assert.deepStrictEqual(untraced('as I said, 99.9', withEarlier), ['99.9']);
});
