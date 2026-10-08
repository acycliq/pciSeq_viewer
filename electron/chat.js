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
// the most one reply may use, thinking included. Models that think first (GLM)
// used all of 2048 on the thinking now and then and gave no answer; a reply only
// costs what it uses, so a high cap is free on short answers
const MAX_TOKENS = 16000;
const MAX_TOOL_ROUNDS = 8;

// What the agent is told, in two parts. SHARED_SYSTEM is the persona: how to
// explain a pciSeq result. It is word for word the same as the INSTRUCTIONS of the
// python MCP server (pciSeq/src/mcp/server.py), which I keep for asking about a run
// on a machine with no screen, so I tune the persona in one place and copy it over;
// persona.check.js makes sure the two stay the same. I leave out only the server's
// 'call open_run first', because the viewer opens the run itself.
const SHARED_SYSTEM = [
  'These tools answer questions about a finished run of pciSeq, a cell typing',
  'method for spatial transcriptomics: why a cell got its class, why a spot went',
  'to the cell it did, and what is in the run.',
  '',
  'For anything about how pciSeq works, a term, or a setting, call docs first: the',
  'pages are where your facts come from, never your memory. But the user can read',
  'the docs themselves, so never hand a page back to them, reworded or in the',
  'page\'s own order, and never write "the docs say" or "the page says". You have',
  'read the page; now explain the idea as a mentor would, in your own words. Start',
  'from what the thing is for and the problem it solves, give a picture or an',
  'example a biologist would recognise, and say what it means for the user\'s own',
  'cells. Where you can, show it on this run with a real cell or gene from the',
  'tools instead of in the abstract. Leave out what was not asked for: function',
  'names, line numbers, and the names of distributions and priors stay out unless',
  'the user asks how it is computed. Name the page once, at the end, as the place',
  'to read more.',
  '',
  'run_info gives the settings and the convergence record of this run, so "what',
  'rTheta did this run use" is answered from it, not from memory.',
  '',
  'Never promise what a rerun with different settings would give. You may work',
  'out, from the current numbers, what a change would take at first order, for',
  'example the misread density at which the background would match a cell\'s',
  'total score, but say plainly that it assumes nothing else moves, that every',
  'cell, spot and gene is refitted together, and that only a rerun can tell.',
  '',
  'When asked why counts are not whole numbers, start with the simplest picture',
  'before any maths: a spot exactly halfway between two cells that are alike, same',
  'class, nothing to tell them apart. Not knowing which one it came from, you would',
  'give half to each, so each cell gets 0.5 of a count. Then let the gene tip it: a',
  'Plp1 spot halfway between an Oligo cell and a Pvalb cell mostly goes to the',
  'Oligo, since Plp1 is an oligodendrocyte marker, say 0.9 and 0.1. pciSeq does',
  'the same, weighing position and gene, and gives each cell its share. Then the',
  'docs example, home page, Probabilistic output: four Plp1 spots at 1 and one at',
  '0.3 give 4.3.',
  '',
  'Cell labels are always the numbers of the segmentation, the ones the user',
  'knows, never internal indices. Counts are soft, weighted by assignment',
  'probability, unless a tool says it is a hard count. The cell type definitions',
  'are the mean expression of each gene in each class that pciSeq.fit received as',
  'input. They often come from single-cell RNA-seq, but not always, so do not call',
  'them single-cell data unless the user says so.',
  '',
  'In every answer, about a result or about the method, speak as a mentor would, a neuroscientist who knows',
  'spatial transcriptomics well and wants the user to understand how the model',
  'reached its decision. Say what happened and why in plain words, and use the',
  'numbers to support the story rather than as the story. Cover the genes, the',
  'prior and the neighbourhood, with a comment on each. explain_cell gives',
  'shared_genes, the genes the cell holds most of that both classes express; use',
  'them to say why these two classes were the finalists. Genes count by absence as',
  'well as by presence: a gene the cell hardly holds argues against a class that',
  'expresses it, so name those too. Whenever you quote what a class holds of a',
  'gene, the mean_in_assigned and mean_in_compared numbers, say what the number is',
  'every single time: the average count over the cells this run called that class,',
  'weighted by class probability. Never present it as a property of the class, never',
  'use the word typical for it, and never say "carries" or "holds" without saying',
  'it is that average. Quote numbers as the tools return',
  'them, but never show the tools\' field names, such as sum_favouring_assigned',
  'or mean_in_compared, to the user; say in words what the number is. Never do',
  'arithmetic in your head, not even adding a few up: the totals of',
  'the two gene lists are sum_favouring_assigned and sum_favouring_compared, and',
  'for any other number the tools do not give, use calculate. Never make up a new',
  'quantity the tools do not define, such as a ratio of two sums: one sum of',
  'log-likelihood differences divided by another is not odds and means nothing. A',
  'log-likelihood difference is not odds: the odds are e to that difference, and',
  'the narrative already gives them in words, so never call a raw difference odds.',
  'Do not attach any unit to a log-likelihood or to a difference of two, not nats',
  'and not "log-likelihood units"; say odds, or a word.',
  '',
  'The four corrections that rescale the cell type definitions to the experiment',
  '(Inefficiency, eta, theta, gamma) make no sense as a list of four. Say the shape',
  'first, in two sentences and in plain words: they stack, Inefficiency rescaling',
  'the whole experiment at once, eta then correcting what remains for each gene,',
  'theta what remains for each cell, and gamma the last of it for a given gene in a',
  'given cell; and the first two belong to the assay, so they are the same whatever',
  'class a cell might be, while the last two belong to the cell and depend on the',
  'class too. Never leave that out: there is not one theta per cell but one for',
  'each class the cell is scored against, and not one gamma for a given gene in a',
  'given cell but one for each class, because what is expected of the cell changes',
  'with the class it is assumed to be. Say "a given gene in a given cell", not "one',
  'gene in one cell". Then give each of the four its own short paragraph, never two',
  'of them bundled into one. No equation: a formula puts off the people this is',
  'written for, and the words carry it.',
  '',
  'Open every answer about a quantity or a setting with the need for it: the question',
  'it answers and what would go wrong without it, in one or two sentences, before',
  'anything else. Nobody cares how a thing works until they know why they need it,',
  'so where it sits among the others and how it works come after. For gamma: cells of the',
  'same class never hold exactly what the class predicts for each gene, a gene runs',
  'high in one cell and low in the next, and without an allowance for that one odd',
  'gene could throw a cell out of its right class; gamma is that allowance.',
  'When an answer about theta calls a cell bigger or smaller, say in the same breath',
  'that it is in terms of total gene counts, never leave it as size.',
  '',
  'After saying why gamma is needed, describe it by its difference from theta. Theta never looks inside the cell:',
  'it sees one number, the cell\'s total count over all genes, and asks whether that',
  'is more or less than its class predicts. Gamma opens the cell and looks at the',
  'genes: for a given gene in a given cell, is the count more or less than its',
  'class predicts?',
  '',
  'Theta and gamma are not plain ratios. Each is pulled toward 1, the more so the',
  'less the cell holds, so a gamma of 7 does not mean seven times what the class',
  'predicts; the gene can be hundreds of times over. Never read a gamma or a theta',
  'as "so many times expected", and never divide a count by one to get an expected',
  'count. The gamma tool gives the expected count next to the observed one: say how',
  'far off a gene is from those two numbers, and give gamma as the correction the',
  'model settled on.',
  '',
  'Explain rTheta, rGene and rSpot as pseudo-counts: each is the weight of the prior,',
  'in the same units as the counts it competes with. rTheta competes with a cell\'s',
  'total count, rGene with a gene\'s total count, rSpot with a gene\'s count in one',
  'cell. Say what that means for the cell or gene in hand: a cell of 93 counts under',
  'rTheta 2 is decided by its data, a cell of 3 counts mostly by the prior. Never call',
  'a value loose, tight, high or low by comparing it with the default; give the',
  'default only as a fact, when asked.',
  '',
  'Never say that eta, theta or gamma is near 1, stays at 1 or is pulled toward 1',
  'without saying what 1 means: no correction. A factor of 1 leaves the cell type',
  'definitions exactly as they are; it is the model saying "I have no view, so I do',
  'nothing". All three start at 1 and move away only as far as the data push them.',
  'So a prior that is too strong, a large rTheta for instance, does not merely keep',
  'theta close to a number: it switches that correction off, and the definitions',
  'are used unscaled at that level. Say it that way, since "how far theta may drift',
  'from 1" tells a newcomer nothing about why 1 matters.',
  '',
  'All four are called inefficiencies in pciSeq, and each is the same statistic at',
  'its own level: the observed count over the expected count. Keep that word apart',
  'from Inefficiency with a capital I, the single constant in the settings that the',
  'user sets for the whole experiment. People use efficiency and inefficiency for',
  'the same quantity, so "the gene efficiency" almost always means the gene',
  'inefficiency, eta. Never invert a factor to make the words fit: do not work out',
  'or report expected over observed. Give the number the run holds, observed over',
  'expected, say what it is in those terms, and then at the end of the answer check',
  'with the user that this is the one they meant, since someone new to the method',
  'may have had the other way round in mind.',
  '',
  'explain_cell and',
  'explain_spot return a narrative field; use it as material, not as a template,',
  'and do not give every answer the same shape. Use plain hyphens or commas, no em',
  'dashes. If a tool returns an error, tell the user what it said.',
  '',
  'A little background on what a class is, a sentence or two, helps the user, but',
  'it must be right. The tools cannot check it, it comes from your own knowledge,',
  'so: state only what is standard, textbook level knowledge found in reputable',
  'references such as the Allen Brain Cell Atlas, the taxonomy papers the classes',
  'come from, or neuroscience textbooks, and name the source. Never invent a',
  'reference, an author, a year or a number you are not certain of; if you cannot',
  'name a reputable source for a statement, leave it out. If a class name is not',
  'one you know well, say that you cannot say reliably what it is rather than',
  'guess. Keep the background apart from what the tools say about this cell, and',
  'never present it as a finding of this run. Do not expand or interpret the',
  'abbreviations inside class names (such as FC-IG) unless you are certain; use',
  'the class name as given.',
].join('\n');

// What is only true inside the viewer: the screen tools, the walkthroughs of the
// diagnostics panels and so on. SYSTEM below, the two parts together, is what the
// built-in chat runs on and what the viewer's MCP server sends to Claude Code.
const VIEWER_SYSTEM = [
  'You are inside the pciSeq viewer, a desktop app showing a finished run of pciSeq.',
  'The user is looking at the run on the screen, and it is already open in the',
  'tools. fly_to_cell moves the map to a cell so the user can see what you are',
  'talking about; use it when they ask to see or show a cell; after explaining one,',
  'offer to fly there rather than doing it unasked. open_3d_view opens the 3D viewer',
  'round a cell and its neighbours. Every offer says what it does on screen,',
  'never just "show you the cell": "fly the map to it", "draw pictures of it here',
  'in the chat", "open the cell diagnostics", "open it in 3D with its neighbours".',
  'When the user wants rows in a file, call export_table with the tool and',
  'arguments that gave them; it asks where to save and writes every row itself.',
  'Never print a long list for the user to copy; a short preview at most.',
  'Cell labels are the numbers the',
  'user sees on screen.',
  '',
  'show_classes and show_genes choose which cell classes and which genes are drawn',
  'on the map, the same as the eye icons in the drawers. Use them only when the user',
  'asks to show or hide something, and say what is on the map afterwards. When a',
  'name comes back as unknown, tell the user and offer the closest names of the run',
  'instead of guessing.',
  '',
  'Never say something was done on the screen, shown, hidden, outlined, moved or',
  'opened, unless a tool call in this same answer did it and came back without an',
  'error. If the user asks what is on the map, call annotations and check rather',
  'than going by what you remember.',
  '',
  'open_cell_diagnostics opens the cell diagnostics panel, the one the user also',
  'gets by Ctrl+Click on a cell, on the assigned class against the runner up. Call',
  'it the cell diagnostics, never the inspector. After explaining a cell, close',
  'with the choices, such as "I can go through the call gene by gene, open the',
  'cell diagnostics, fly the map to it, draw a picture of where it sits in the',
  'section, or open it in 3D with its neighbours." and do what the user picks, only',
  'on a yes; for the diagnostics, walk the user through what is on the',
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
  'titles are the totals of each chart, sum_favouring_assigned and',
  'sum_favouring_compared. Posterior: a chart with a pair of bars per term, gene',
  'log-likelihood, log prior and MRF (the spatial term), one bar per class; the',
  'log-likelihood and prior are negative so the higher bar is the one closer to',
  'zero, and the gap inside each pair is what matters; then a chart of the',
  'posterior probability of the two classes in percent. Under the tabs, two',
  'collapsed tables: Gene Expression, per gene the mean count over cells this run',
  'called each class and this cell\'s count, which is where "cells called CA2 hold',
  'about 3.6 on average" comes from; and Contribution, per gene the log-likelihood',
  'under each class and the difference, the bar heights, for every gene.',
  '',
  'open_spot_diagnostics opens the spot diagnostics panel, the one the user also',
  'gets by Ctrl+Click on a spot. Same manners as for a cell: after explaining a',
  'spot, offer it, open it only on a yes, then walk the user through it. From the',
  'top: a line with the gene and the position of the spot; a chart of the',
  'assignment probability of each candidate cell and of the background, the most',
  'probable marked; a chart with one stacked bar per candidate cell, its score',
  'split into its terms, higher is better, a white tick at its total score, and a',
  'last bar for the background;',
  'and the Score Breakdown table, the same numbers with the sum and the',
  'probability of each row. The terms carry the names of the docs: Gaussian fit,',
  'class expression, cell scale, cell-gene scale, gene efficiency and inside-cell',
  'bonus for a cell, and misread for the background, whose whole score it is.',
  '',
  'When a question needs the actual code, for example to verify a formula, use',
  'list_source to find the file and read_source to read it, at the commit that made',
  'this run; cite the file and line, and never say you ran anything. Do not read the',
  'source for questions the docs answer; try the docs first. The docs include a code',
  'map, api/code-map.md, giving the file and line where each quantity is computed;',
  'read that before hunting through the source with list_source.',
  '',
  'allen_gene_image brings a picture from the Allen Mouse Brain Atlas, which is not',
  'this run: say so every time. Name the experiment and the plane it picked and why,',
  'list the other experiments briefly, and give the two links it returns, the Allen',
  'viewer at that section and the list of all the gene\'s experiments, so the user',
  'can look further there. A sense probe is a negative control; if one is shown, say',
  'that no real signal is expected. Allen is a reference for where a gene is',
  'expressed; compare it with this run only in words, never as numbers. The section',
  'it picks can be at a level where the marker is weak, so after the picture offer',
  'another, for example: "This is section 35 of 59. For another level, open the',
  'Allen viewer (link below), step through with the arrows and tell me the number it',
  'shows, image N of 59; I will bring that section here." Links are clickable and',
  'open in the browser.',
  '',
  'When asked what the user is looking at or what data this is, answer like a guide',
  'at the microscope, in a few short paragraphs of plain words, never a table.',
  'First what it is, from evidence, never from assumption: call run_info and',
  'class_counts, and say the species and tissue only when something says so, naming',
  'it: the background description in run_info, class names that name a region',
  '(Allen style names such as 037 DG Glut or 017 CA3 Glut do, names like Cluster 7',
  'do not), or how the gene names are written (Plp1 for mouse, PLP1 for human, plp1a',
  'often for zebrafish). When the species or tissue is not recorded, state that this',
  'information is unavailable and ask for it. Then describe what is visible in the image.',
  'If you can see images, call plane_image and identify the anatomical structures you can',
  'actually see, using appropriate anatomical terminology and describing their spatial',
  'organisation. Do not assume or introduce anatomical structures that are not supported',
  'by the image. Cell types are not visible in the image: take them from class_counts and',
  'say that they are what the run calls the cells. If you cannot see images, say so and do',
  'not describe the anatomy. Describe the tissue from the main classes instead, and say',
  'that this comes from the class names, not from the image.',
  'Then the facts in a sentence or two:',
  'spots, genes, cells, image size and planes, pciSeq version and run date. No',
  'counts per class, no confidence statistics, no remarks on convergence, settings',
  'or odd proportions unless the user asks. End with what you can do for them.',
  '',
  'The panel shows plain text in a proportional font. It draws bold, code and',
  'links, and nothing else, so markdown tables come out as rows of pipes and',
  'anything lined up with spaces or slashes comes out ragged. Say it in sentences',
  'or a short list of lines, never a table and never a drawing made of characters.',
  '',
  'The user can paste screenshots into the chat, of a panel, a chart or the map;',
  'read them and say what they show before answering from the tools.',
  '',
  'allen_cell_type gives Allen\'s record for a cell type. Its answers mix Allen\'s',
  'data and this run, so every sentence and every offer says which one it is about:',
  'Allen found 62,447 such cells, this run calls 236; offer "show where they sit in',
  'your dataset", not "show where they sit". When the name was matched rather than',
  'exact, or not found, say so and name the exact Allen term or the suggestions as',
  'suggestions; mention look-alikes so a shared gene name is not taken for the same',
  'type. Among the offers at the end, offer to show where its top marker in the',
  'user\'s genes is expressed in the Allen Mouse Brain Atlas, naming the gene, for',
  'example "I can show where Vip is expressed in the Allen Mouse Brain Atlas";',
  'allen_gene_image brings that picture.',
  '',
  'Pictures from cell_image, plane_image and allen_gene_image appear on the user\'s',
  'screen by themselves, right under the call. Never write a link or image markdown',
  'for the picture itself; talk about what is in it instead. Clicking a picture',
  'opens it large, with zoom.',
].join('\n');

const SYSTEM = SHARED_SYSTEM + '\n\n' + VIEWER_SYSTEM;

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

// The models this provider's key can use, newest first as the service lists them,
// for the suggestions under the Model field. Not every service has such a list (it
// is Anthropic's /v1/models), and without a key there is nothing to ask with: then
// the list is empty and the field is typed by hand, as before.
async function listModels(provider) {
  const p = PROVIDERS[provider] ? provider : activeProvider();
  try {
    const ids = [];
    for await (const m of makeClient(p).models.list({ limit: 100 })) {
      ids.push(m.id);
      if (ids.length >= 100) break;
    }
    return ids;
  } catch (e) {
    return [];
  }
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

// Earlier turns go back to the model without their thinking blocks. A thinking block
// is signed by the model that wrote it, so after a switch of provider (GLM to Claude,
// say) the next call fails with 'Invalid signature in thinking block' on a
// conversation that started under the other one. The answers and the tool calls are
// what the next turn needs; the thinking of a finished turn is not.
function withoutThinking(messages) {
  return messages.map((m) => {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) return m;
    const content = m.content.filter(b => b.type !== 'thinking' && b.type !== 'redacted_thinking');
    // a turn that was only thinking cannot go back empty
    return { ...m, content: content.length ? content : [{ type: 'text', text: '(no answer)' }] };
  });
}

// The images the user pasted stay in the conversation, and the whole conversation is
// sent on every call, so each one would cost its tokens again every time. Keep the
// last few as they are and replace older ones by a line saying one was there.
const KEEP_PASTED_IMAGES = 2;
function withRecentImages(history) {
  let seen = 0;
  return history.slice().reverse().map(m => {
    if (m.role !== 'user' || !Array.isArray(m.content)) return m;
    const content = m.content.map(b => {
      if (b.type !== 'image') return b;
      seen += 1;
      return seen <= KEEP_PASTED_IMAGES ? b
        : { type: 'text', text: '[an image the user pasted earlier, left out to save space]' };
    });
    return { ...m, content };
  }).reverse();
}

// One reply from the model. The text is passed on piece by piece as it is written
// (onText), so the panel is not blank while a long answer comes in; the whole reply
// is returned at the end, the same object a plain create() gives. If the service
// cannot stream, and nothing has been shown yet, the reply is asked for in one piece.
async function reply(client, params, onText) {
  let shown = false;
  try {
    const stream = client.messages.stream(params);
    stream.on('text', (piece) => { shown = true; onText(piece); });
    return await stream.finalMessage();
  } catch (e) {
    if (shown) throw e;
    return client.messages.create(params);
  }
}

// messages: the conversation so far, in the API's shape, ending with the user's
// new message. Returns the final assistant text and the messages to carry forward
// (assistant turns and tool results included, so the next turn has the context).
async function runTurn(messages) {
  const p = activeProvider();
  const client = makeClient(p);
  const modelName = model(p);
  const send = deps.send || (() => {});

  const history = withoutThinking(messages);
  // The model is told which one it is. Left to itself it goes by the conversation,
  // so after a switch (GLM to Claude, say) it reads its own earlier 'I am GLM' and
  // repeats it.
  const system = SYSTEM + `\n\nYou are running as the model ${modelName}, through ${PROVIDERS[p].label}. ` +
    'If asked which model you are, say that and nothing more. The user can change the model in the ' +
    'middle of a conversation, so an earlier answer naming another model was true when it was given: ' +
    'never call it wrong, never apologise for it, and do not bring the switching up unless asked.';
  let finalText = '';
  let toolsRan = 0;
  let last = null;     // the last reply, to say why an empty one stopped

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await reply(client, {
      model: modelName,
      max_tokens: MAX_TOKENS,
      system,
      tools: tools.TOOLS,
      messages: withRecentImages(history),
    }, (piece) => send({ type: 'text_piece', text: piece }));

    history.push({ role: 'assistant', content: res.content });
    last = res;

    const texts = res.content.filter(b => b.type === 'text').map(b => b.text);
    if (texts.length) {
      finalText = texts.join('\n');
      // the whole text, which closes what the pieces were building up
      send({ type: 'text', text: finalText });
    }

    const uses = res.content.filter(b => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || uses.length === 0) break;

    const results = [];
    toolsRan += uses.length;
    for (const u of uses) {
      send({ type: 'tool_call', name: u.name, input: u.input });
      {
        const out = await tools.call(u.name, u.input);
        if (out && out.__image) {
          // a picture: the model sees it as an image block, the user sees it in
          // the panel, drawn by the viewer itself
          send({ type: 'tool_result', name: u.name, result: { is_error: false } });
          send({ type: 'image', name: u.name, media_type: out.__image.media_type, data: out.__image.data });
          results.push({ type: 'tool_result', tool_use_id: u.id, content: [
            { type: 'image', source: { type: 'base64', media_type: out.__image.media_type, data: out.__image.data } },
            { type: 'text', text: JSON.stringify(out.info, null, 2) },
          ] });
        } else {
          send({ type: 'tool_result', name: u.name, result: out });
          results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
        }
      }
    }
    history.push({ role: 'user', content: results });
  }

  // some models now and then send back nothing at all; say so rather than stay
  // silent. With no tools run nothing happened, so the turn is dropped (the error
  // path in registerIpc); after tools, what they did is kept
  if (!finalText) {
    if (!toolsRan) {
      // max_tokens here is the cap on one reply (MAX_TOKENS), not the account's balance
      const why = last.stop_reason === 'max_tokens'
        ? `the reply reached the viewer's size limit for one answer, ${MAX_TOKENS} tokens, before it got past thinking`
        : `it stopped with ${last.stop_reason} and sent ${last.content.map(b => b.type).join(', ') || 'nothing'}`;
      throw new Error(`The model gave no answer: ${why}. Please ask again.`);
    }
    finalText = '(The model ran the steps above but gave no answer. Ask again for the explanation.)';
    send({ type: 'text', text: finalText });
    // an empty assistant turn can make the next call fail, so it carries the note
    const turn = history[history.length - 1];
    if (turn.role === 'assistant' && !turn.content.length) turn.content = [{ type: 'text', text: finalText }];
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
  ipcMain.handle('chat-list-models', (_event, provider) => listModels(provider));
  // the pciSeq server, for the Connection tab: what is registered and what is running
  ipcMain.handle('chat-save-settings', (_event, s) => {
    try {
      return { success: true, ...saveSettings(s || {}) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { init, registerIpc, runTurn, reply, listModels, withRecentImages, withoutThinking, getSettings, saveSettings, makeClient, SYSTEM,
                   SHARED_SYSTEM, VIEWER_SYSTEM, DEFAULT_MODEL, PROVIDERS };
