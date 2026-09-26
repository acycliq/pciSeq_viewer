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
// safeStorage and kept in electron-store; ANTHROPIC_API_KEY (or ZAI_API_KEY for
// Z.ai) in the environment is used when no key has been saved.
//
// The model can come from Anthropic or from any service that speaks Anthropic's
// Messages protocol, such as Z.ai's GLM. Each provider keeps its own key and model,
// so switching does not lose the other one.

const { safeStorage } = require('electron');
const Anthropic = require('@anthropic-ai/sdk');
const tools = require('./tools');

const DEFAULT_MODEL = 'claude-sonnet-5';

// baseURL null means Anthropic itself. Z.ai's address and model name are from its
// docs (docs.z.ai, Tool Integration), September 2026.
const PROVIDERS = {
  anthropic: { label: 'Anthropic', baseURL: null, model: DEFAULT_MODEL, env: 'ANTHROPIC_API_KEY' },
  zai: { label: 'Z.ai (GLM)', baseURL: 'https://api.z.ai/api/anthropic', model: 'glm-5.2', env: 'ZAI_API_KEY' },
  other: { label: 'Other (Anthropic-compatible)', baseURL: '', model: '', env: null },
};
const MAX_TOKENS = 2048;
const MAX_TOOL_ROUNDS = 8;

// Same standing instructions as the Python MCP server, plus what is different here:
// the model is inside the viewer and can move the map.
const SYSTEM = [
  'You are inside the pciSeq viewer, a desktop app showing a finished run of pciSeq,',
  'a cell typing method for spatial transcriptomics. The user is looking at the run',
  'on the screen. Tools answer questions about it: why a cell got its class, why a',
  'spot went to the cell it did. fly_to_cell moves the map to a cell so the user can',
  'see what you are talking about; use it when they ask to see or show a cell; after',
  'explaining one, offer to fly there rather than doing it unasked.',
  '',
  'open_cell_diagnostics opens the cell diagnostics panel, the one the user also',
  'gets by Ctrl+Click on a cell, on the assigned class against the runner up. Call',
  'it the cell diagnostics, never the inspector. After explaining a cell, close',
  'with an offer such as "Do you want me to show you the diagnostics for cell',
  '16609?" and open it only on a yes; then walk the user through what is on the',
  'screen, the way a mentor would at a colleague\'s desk. The panel has two tabs.',
  'Genes: two bar charts. Each bar is the difference between two log-likelihoods,',
  'for one gene: how well the cell\'s count of it fits the assigned class minus how',
  'well it fits the compared class. The sign is only the direction of the pull:',
  'positive pulls for the assigned class, negative for the compared class. The',
  'length is the strength. The top chart shows the ten genes pulling hardest for',
  'the assigned class, bars going up; the bottom chart the ten pulling hardest for',
  'the compared class, bars hanging below zero, and the deeper the bar, the harder',
  'that gene pulls. Introduce them as the genes pulling hardest for each class, not',
  'as the most negative values, since negative sounds like bad. The sums in the',
  'titles are the totals of each chart. Posterior: a chart with a pair of bars',
  'per term, gene log-likelihood, log prior and MRF (the spatial term), one bar per',
  'class; the log-likelihood and prior are negative so the higher bar is the one',
  'closer to zero, and the gap inside each pair is what matters; then a chart of',
  'the posterior probability of the two classes in percent. Under the tabs, two',
  'collapsed tables: Gene Expression, per gene the mean count over cells this run',
  'called each class and this cell\'s count, which is where "cells called CA2 hold',
  'about 3.6 on average" comes from; and Contribution, per gene the log-likelihood',
  'under each class and the difference, the bar heights, for every gene.',
  '',
  'Cell labels are always the numbers of the segmentation, the ones the user sees on',
  'screen. Counts are soft, weighted by assignment probability, unless a tool says',
  'it is a hard count.',
  '',
  'When you explain a result, speak as a mentor would, a neuroscientist who knows',
  'spatial transcriptomics well and wants the user to understand how the model',
  'reached its decision. Say what happened and why in plain words, and use the',
  'numbers to support the story rather than as the story. A sentence on what the',
  'class is helps. Cover the genes, the prior and the neighbourhood, with a comment',
  'on each. Genes count by absence as well as by presence: a gene the cell hardly',
  'holds argues against a class that expresses it, so name those too. Whenever you',
  'quote what a class holds of a gene, the mean_in_assigned and mean_in_compared',
  'numbers, say what the number is every single time: the average count over the',
  'cells this run called that class, weighted by class probability. Never present',
  'it as a property of the class or a typical cell, and never say "carries" or',
  '"holds" without saying it is that average. Quote numbers as the tools return',
  'them and never do arithmetic on them yourself, not even adding a few up: the',
  'sums in the chart titles are sum_favouring_assigned and sum_favouring_compared,',
  'and if a total is not in the output, say so. A log-likelihood difference is not',
  'odds: the odds are e to that difference, and the narrative already gives them',
  'in words, so never call a raw difference odds. Do not use',
  'units such as nats; say odds, or a word. explain_cell and explain_spot return a',
  'narrative field; use it as material, not as a template, and do not give every',
  'answer the same shape. Use plain hyphens or commas, no em dashes. If a tool',
  'returns an error, tell the user what it said.',
].join('\n');

let deps = { store: null, send: null };

function init(d) {
  deps = { ...deps, ...d };
}

// ------------------------------------------------------------- settings

// Before providers existed there was one key and one model, both Anthropic's. They
// are still read as the Anthropic ones so an existing setup keeps working.
const OLD_KEY_FIELD = 'chatApiKeyEncrypted';
const OLD_MODEL_FIELD = 'chatModel';
const PROVIDER_FIELD = 'chatProvider';
const BASE_URL_FIELD = 'chatBaseUrl';   // only for 'other'

const keyField = p => (p === 'anthropic' ? OLD_KEY_FIELD : 'chatApiKeyEncrypted_' + p);
const modelField = p => (p === 'anthropic' ? OLD_MODEL_FIELD : 'chatModel_' + p);

function activeProvider() {
  const p = deps.store.get(PROVIDER_FIELD, 'anthropic');
  return PROVIDERS[p] ? p : 'anthropic';
}

function savedKey(p) {
  const enc = deps.store.get(keyField(p), '');
  if (!enc) return '';
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch (e) {
    return '';
  }
}

function envKey(p) {
  const name = PROVIDERS[p].env;
  return (name && process.env[name]) || '';
}

function apiKey(p) {
  return savedKey(p) || envKey(p);
}

function baseURL(p) {
  return p === 'other' ? deps.store.get(BASE_URL_FIELD, '') : PROVIDERS[p].baseURL;
}

function model(p) {
  return deps.store.get(modelField(p), PROVIDERS[p].model);
}

// provider: which one to describe, the active one if not given. The panel asks for
// another when you switch the dropdown, before saving.
function getSettings(provider) {
  const p = PROVIDERS[provider] ? provider : activeProvider();
  return {
    provider: p,
    active: activeProvider(),
    providers: Object.entries(PROVIDERS).map(([id, v]) => ({ id, label: v.label })),
    hasKey: Boolean(apiKey(p)),
    keyFromEnv: !savedKey(p) && Boolean(envKey(p)),
    envName: PROVIDERS[p].env,
    model: model(p),
    baseURL: baseURL(p) || '',
  };
}

function saveSettings({ provider, apiKey: key, model: m, baseURL: url } = {}) {
  const p = PROVIDERS[provider] ? provider : activeProvider();
  if (typeof key === 'string' && key.trim() !== '') {
    // on Linux without a keyring, and outside Electron altogether, there is no
    // encryption to be had; say so rather than fall over
    const canEncrypt = Boolean(safeStorage) && typeof safeStorage.isEncryptionAvailable === 'function'
      && safeStorage.isEncryptionAvailable();
    if (!canEncrypt) {
      throw new Error('this system cannot encrypt the key for storage; set ' +
        (PROVIDERS[p].env || 'the key') + ' in the environment instead');
    }
    deps.store.set(keyField(p), safeStorage.encryptString(key.trim()).toString('base64'));
  }
  if (typeof m === 'string' && m.trim()) {
    deps.store.set(modelField(p), m.trim());
  }
  if (p === 'other' && typeof url === 'string') {
    deps.store.set(BASE_URL_FIELD, url.trim());
  }
  if (p === 'other' && !baseURL(p)) {
    throw new Error('give the address of the service for Other');
  }
  deps.store.set(PROVIDER_FIELD, p);
  return getSettings(p);
}

// The client for the active provider. For anything but Anthropic the key goes as a
// Bearer token, which is what Z.ai expects, and apiKey is set to null on purpose:
// otherwise the SDK would pick up ANTHROPIC_API_KEY from the environment and send
// your Anthropic key to somebody else's server.
function makeClient(p) {
  const key = apiKey(p);
  if (!key) {
    throw new Error('no API key for ' + PROVIDERS[p].label + '. Paste one on the Connection tab' +
      (PROVIDERS[p].env ? ', or set ' + PROVIDERS[p].env : '') + '.');
  }
  if (p === 'anthropic') return new Anthropic({ apiKey: key });
  return new Anthropic({ apiKey: null, authToken: key, baseURL: baseURL(p) });
}

// ------------------------------------------------------------- one turn

// messages: the conversation so far, in the API's shape, ending with the user's
// new message. Returns the final assistant text and the messages to carry forward
// (assistant turns and tool results included, so the next turn has the context).
async function runTurn(messages) {
  const p = activeProvider();
  const client = makeClient(p);
  const modelName = model(p);
  const send = deps.send || (() => {});

  const history = [...messages];
  let finalText = '';

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await client.messages.create({
      model: modelName,
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
  ipcMain.handle('chat-get-settings', (_event, provider) => getSettings(provider));
  ipcMain.handle('chat-save-settings', (_event, s) => {
    try {
      return { success: true, ...saveSettings(s || {}) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { init, registerIpc, runTurn, getSettings, saveSettings, makeClient, SYSTEM, DEFAULT_MODEL, PROVIDERS };
