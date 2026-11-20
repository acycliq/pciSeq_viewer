// A line in a local file for every question put to the chat: how many rounds with
// the model it took, which tools ran, the tokens used, and whether the number
// check found anything. It is there to answer questions about the agent itself:
// does it run out of rounds, what does a question cost, how often does the number
// check send an answer back.
//
// The file is JSON Lines, one JSON object per line, in the app's own data folder
// (main.js gives the path). Nothing is sent anywhere. Lines are only added, and
// nothing trims the file; a line is about 300 bytes.
//
// Wiring: chat.js makes a record per question (newRecord), fills it in as the turn
// goes (countReply, and the fields it sets itself) and writes it when the turn is
// over, answered or failed (write).

const fs = require('fs');

// how much of the question is kept, enough to recognise it
const QUESTION_CHARS = 200;

// the user's new message as text, cut short. A pasted image is left out
function questionText(messages) {
  const content = messages[messages.length - 1].content;
  const text = typeof content === 'string'
    ? content
    : content.filter(block => block.type === 'text').map(block => block.text).join(' ');
  return text.slice(0, QUESTION_CHARS);
}

function newRecord(messages) {
  return {
    time: new Date().toISOString(),
    question: questionText(messages),
    provider: null,
    model: null,
    seconds: 0,
    // calls to the model, and the tools it asked for, in order
    rounds: 0,
    tools: [],
    // true when the model still wanted tools after the last round it is allowed
    ran_out_of_rounds: false,
    input_tokens: 0,
    output_tokens: 0,
    // false when a reply came without its token counts, so the two sums are short
    tokens_reported: true,
    // numbers in the answer that no tool returned: in the first answer, and in
    // the one given after the model was asked to fix them
    numbers_not_traced: 0,
    numbers_not_traced_after_retry: 0,
    error: null,
  };
}

// one reply from the model: a round more, and its tokens
function countReply(record, res) {
  record.rounds += 1;
  if (!res.usage) {
    record.tokens_reported = false;
    return;
  }
  record.input_tokens += res.usage.input_tokens;
  record.output_tokens += res.usage.output_tokens;
}

// Adds the record to the file as one line. Without a file there is no log (the
// eval run and the tests give none). A log that cannot be written must not cost
// the user their answer, so the failure is only reported in the console.
function write(file, record) {
  if (!file) return;
  record.seconds = (Date.now() - Date.parse(record.time)) / 1000;
  try {
    fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
  } catch (e) {
    console.warn('chat log not written:', e.message);
  }
}

module.exports = { newRecord, countReply, write };
