// Did the model make a number up? The persona tells it never to do arithmetic in
// its head and to quote what the tools return, and this is the check that it did:
// every number in an answer must be one that a tool returned, that the model
// passed to a tool, or that the user typed. Anything else is reported.
//
// Pure functions on the chat's own message list (the Anthropic Messages shape),
// so the same code runs on every live answer (chat.js, runTurn) and on a fixed
// question set (tests/eval). No dependencies.
//
// What counts as a match is a judgement, written down here so it can be argued:
//   - the answer may round: 12.3 for 12.2847, 74% for 0.737, "about 12" for 12.28,
//     86,100 for 86115.88 (the trailing zeros say how far it was rounded, up to
//     2%, and only for a value a tool computed: a label or a count is quoted whole)
//   - a ratio may be read as a change: "13% more" for a theta of 1.13
//   - the answer may drop the sign: "decreases the odds by 12.3" for -12.3
//   - the length of a list a tool returned counts: "39 classes" for 39 entries
//   - integers up to 10 are not checked: "two genes", "3 of the 4 candidates"
//     are counts the model made by reading a list, not numbers it computed
//   - a number glued to a letter (Plp1, CA1) is part of a name, not a number
// And a limit: a made up number can land near one a tool returned by chance.
// The more numbers a tool returns, the likelier; on an explain_cell answer a
// one-decimal number does so about one time in ten. The check catches the
// invented number, not the invented number that happens to be plausible.

// 12.3, -0.5, 1,234, 2e-3; not the 1 in Plp1
const NUMBER = /(?<![A-Za-z_\d.])-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[+-]?\d+)?(?![A-Za-z_])/gi;
const SMALL_COUNT = 10;

// 7.4 x 10^-20, or a bare 10^-20, as the model writes it, read as the 7.4e-20
// (or 1e-20) a tool returns. The sign may be x, * or a multiplication sign
// (any character outside ASCII), the exponent may sit in brackets or braces.
// A bare power of ten is marked ~, since "of the order of 10^-20" claims only
// the exponent, and matches() reads it that way
// The minus may be the typographic one (character 8722), which is not '-'
const MINUS = String.fromCharCode(8722);
const POWER_OF_TEN = new RegExp('(?:(\\d+(?:\\.\\d+)?)\\s*(?:[x*]|[^\\x00-\\x7F])\\s*)?10\\^[({]?([-' + MINUS + ']?\\d+)[)}]?', 'g');
const toE = (m, mantissa, exp) => (mantissa || '~1') + 'e' + exp.replace(MINUS, '-');
// 10 followed by superscript digits is a superscript exponent. The persona
// forbids them and this file does not read them: reported as written, so the
// model is asked to write the number again the plain way. The digits by
// character code, since they cannot be typed: superscript one, two, three,
// zero, four to nine, and the superscript minus
const SUPERSCRIPTS = String.fromCharCode(185, 178, 179, 8304, 8308, 8309, 8310, 8311, 8312, 8313, 8315);
const SUPERSCRIPT_POWER = new RegExp('\\b10[' + SUPERSCRIPTS + ']+', 'g');

// every number in a text, with how it was written and how many decimals it has
function numbersIn(text) {
  const out = [];
  const plainText = String(text).replace(POWER_OF_TEN, toE);
  for (const m of plainText.matchAll(NUMBER)) {
    const plain = m[0].replace(/,/g, '');
    const frac = /\.(\d+)(?:e|$)/i.exec(plain);
    const exp = /e([+-]?\d+)$/i.exec(plain);
    // decimals: how far the number was rounded. 12.3 has one, 86100 has minus
    // two (its trailing zeros), 1.34e19 has 2 - 19, so the tolerance below
    // follows the writing
    const zeros = frac || exp ? 0 : (/0*$/.exec(plain)[0].length);
    const decimals = (frac ? frac[1].length : 0 - zeros) - (exp ? Number(exp[1]) : 0);
    const order = plainText[m.index - 1] === '~';
    out.push({ text: m[0], value: Math.abs(Number(plain)), decimals, order });
  }
  return out;
}

// What the model is told when an answer has such numbers: chat.js sends it as a
// user message and runs the model again. It names the numbers, so allowed()
// must not count it as a source, which it knows by the opening words.
const RETRY_OPENING = 'Not from any tool output: ';
function retryNote(numbers) {
  return RETRY_OPENING + numbers.join(', ') + '. Work each out with calculate, or leave it out, ' +
    'and give the whole answer again.';
}

// the numbers the model was allowed to quote: what the user wrote, what the
// model asked a tool for, and what the tools returned. Assistant text is left
// out, since an invented number repeated later is still invented.
function allowed(messages) {
  const pool = [];
  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const blocks = typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : msg.content;
    for (const b of blocks || []) {
      if (msg.role === 'user' && b.type === 'text' && !b.text.startsWith(RETRY_OPENING)) pool.push(...numbersIn(b.text));
      if (msg.role === 'user' && b.type === 'tool_result') {
        const text = resultText(b.content);
        pool.push(...numbersIn(text), ...listLengths(text).map(value => ({ value })));
      }
      if (msg.role === 'assistant' && b.type === 'tool_use') pool.push(...numbersIn(JSON.stringify(b.input)));
    }
  }
  return pool.map(n => n.value);
}

// a tool result is a JSON string, or a list of text and image blocks
function resultText(content) {
  if (typeof content === 'string') return content;
  return (content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

// how long each list in a JSON result is, for "39 classes" said of 39 entries
function listLengths(text) {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) { out.push(v.length); v.forEach(walk); }
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  try { walk(JSON.parse(text)); } catch (e) { /* not JSON: an error text, a note */ }
  return out;
}

// does a written number agree with some allowed value, once that value is
// rounded the way the number was written: as it is, as a percentage, or as a
// percentage change from 1 (the 13% more of a theta of 1.13). Rounding to
// trailing zeros may not move the number by more than 2%: 86,100 for 86,115
// yes, 40 for 39 no.
function matches(n, pool) {
  // "of the order of 10^-20": anything from 1e-20 up to 1e-19
  if (n.order) return pool.some(p => p >= n.value * 0.999 && p < n.value * 10);
  let tol = 0.5 * Math.pow(10, -n.decimals) + 1e-9;
  if (n.decimals < 0) tol = Math.min(tol, 0.02 * n.value);
  return pool.some(p => {
    // rounding to trailing zeros is for a value a tool computed; a label or a
    // hard count is a whole number and is quoted whole (20500 is not cell 20515)
    const t = n.decimals < 0 && Number.isInteger(p) ? 0.5 : tol;
    return Math.abs(p - n.value) <= t
      || Math.abs(p * 100 - n.value) <= t
      || Math.abs(Math.abs(p - 1) * 100 - n.value) <= t;
  });
}

// the numbers in the answer that no tool, input or question accounts for, as
// written, each once
function untraced(answer, messages) {
  const pool = allowed(messages);
  const bad = [];
  for (const n of numbersIn(answer)) {
    if (n.decimals <= 0 && n.value <= SMALL_COUNT) continue;
    if (matches(n, pool)) continue;
    if (!bad.includes(n.text)) bad.push(n.text);
  }
  for (const m of String(answer).matchAll(SUPERSCRIPT_POWER)) {
    if (!bad.includes(m[0])) bad.push(m[0]);
  }
  return bad;
}

module.exports = { numbersIn, allowed, untraced, retryNote };
