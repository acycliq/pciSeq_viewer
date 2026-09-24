// The chat panel's brain, in the main process: one turn of conversation with the
// model, including any tool calls it makes along the way.
//
// The loop is the standard one. Send the messages with the tool list; if the model
// answers with tool_use blocks, run each through tools.call, hand the results back
// as tool_result blocks, and go round again; stop when it answers with text only.
// Every step is reported to the renderer as a chat-event so the panel can show what
// was looked up, not only the final answer.
//
// The API key never reaches the renderer. It is encrypted with Electron's
// safeStorage and kept in electron-store; ANTHROPIC_API_KEY in the environment is
// used when no key has been saved.

const { safeStorage } = require('electron');
const Anthropic = require('@anthropic-ai/sdk');
const tools = require('./tools');

const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 2048;
const MAX_TOOL_ROUNDS = 8;

// Same standing instructions as the Python MCP server, plus what is different here:
// the model is inside the viewer and can move the map.
const SYSTEM = [
  'You are inside the pciSeq viewer, a desktop app showing a finished run of pciSeq,',
  'a cell typing method for spatial transcriptomics. The user is looking at the run',
  'on the screen. Tools answer questions about it: why a cell got its class, why a',
  'spot went to the cell it did. fly_to_cell moves the map to a cell so the user can',
  'see what you are talking about; use it when they ask to see or show a cell, or',
  'after explaining one.',
  '',
  'Cell labels are always the numbers of the segmentation, the ones the user sees on',
  'screen. Counts are soft, weighted by assignment probability, unless a tool says',
  'it is a hard count.',
  '',
  'When you explain a result, explain it the way a teacher would: say what happened',
  'and why in plain words, and use the numbers to support the story rather than as',
  'the story. explain_cell and explain_spot return a narrative field written that',
  'way; build on it, do not just repeat the table. Do not use units such as nats;',
  'say odds, or a word. If a tool returns an error, tell the user what it said.',
].join('\n');

let deps = { store: null, send: null };

function init(d) {
  deps = { ...deps, ...d };
}

// ------------------------------------------------------------- settings

const KEY_FIELD = 'chatApiKeyEncrypted';
const MODEL_FIELD = 'chatModel';

function savedKey() {
  const enc = deps.store.get(KEY_FIELD, '');
  if (!enc) return '';
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch (e) {
    return '';
  }
}

function apiKey() {
  return savedKey() || process.env.ANTHROPIC_API_KEY || '';
}

function getSettings() {
  return {
    hasKey: Boolean(apiKey()),
    keyFromEnv: !savedKey() && Boolean(process.env.ANTHROPIC_API_KEY),
    model: deps.store.get(MODEL_FIELD, DEFAULT_MODEL),
  };
}

function saveSettings({ apiKey: key, model } = {}) {
  if (typeof key === 'string') {
    // on Linux without a keyring, and outside Electron altogether, there is no
    // encryption to be had; say so rather than fall over
    const canEncrypt = Boolean(safeStorage) && typeof safeStorage.isEncryptionAvailable === 'function'
      && safeStorage.isEncryptionAvailable();
    if (key.trim() === '') {
      deps.store.delete(KEY_FIELD);
    } else if (canEncrypt) {
      deps.store.set(KEY_FIELD, safeStorage.encryptString(key.trim()).toString('base64'));
    } else {
      throw new Error('this system cannot encrypt the key for storage; set ANTHROPIC_API_KEY in the environment instead');
    }
  }
  if (typeof model === 'string' && model.trim()) {
    deps.store.set(MODEL_FIELD, model.trim());
  }
  return getSettings();
}

// ------------------------------------------------------------- one turn

// messages: the conversation so far, in the API's shape, ending with the user's
// new message. Returns the final assistant text and the messages to carry forward
// (assistant turns and tool results included, so the next turn has the context).
async function runTurn(messages) {
  const key = apiKey();
  if (!key) {
    throw new Error('no API key. Paste one in the panel settings, or set ANTHROPIC_API_KEY.');
  }
  const client = new Anthropic({ apiKey: key });
  const model = deps.store.get(MODEL_FIELD, DEFAULT_MODEL);
  const send = deps.send || (() => {});

  const history = [...messages];
  let finalText = '';

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      tools: tools.TOOLS,
      messages: history,
    });

    history.push({ role: 'assistant', content: res.content });

    const texts = res.content.filter(b => b.type === 'text').map(b => b.text);
    if (texts.length) {
      finalText = texts.join('\n');
      send({ type: 'text', text: finalText });
    }

    const uses = res.content.filter(b => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || uses.length === 0) break;

    const results = [];
    for (const u of uses) {
      send({ type: 'tool_call', name: u.name, input: u.input });
      const out = await tools.call(u.name, u.input);
      send({ type: 'tool_result', name: u.name, result: out });
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
    }
    history.push({ role: 'user', content: results });
  }

  send({ type: 'done' });
  return { text: finalText, messages: history };
}

// ------------------------------------------------------------- ipc

function registerIpc(ipcMain) {
  ipcMain.handle('chat-send', async (_event, messages) => {
    try {
      return { success: true, ...(await runTurn(messages)) };
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (deps.send) deps.send({ type: 'error', error: msg });
      return { success: false, error: msg };
    }
  });
  ipcMain.handle('chat-get-settings', () => getSettings());
  ipcMain.handle('chat-save-settings', (_event, s) => {
    try {
      return { success: true, ...saveSettings(s || {}) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { init, registerIpc, runTurn, getSettings, saveSettings, SYSTEM, DEFAULT_MODEL };
