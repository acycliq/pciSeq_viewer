/**
 * The chat panel: ask the run a question in plain words.
 *
 * Docked along the bottom of the window like Cloud Shell, with two tabs: Connection
 * for the API key and the model, and Chat, which works like a terminal session. You
 * type after the >_ prompt, press Enter, the answer appears below the question and
 * a fresh prompt below that.
 *
 * The renderer side only draws and relays. The model call and the tool calls run in
 * the main process (electron/chat.js), reached through window.electronAPI.chatSend;
 * the steps along the way arrive as chat events so the user sees what was looked up.
 * The conversation is kept here in the API's shape and handed back whole on every
 * turn, so the model has the context of earlier questions.
 */

let messages = [];        // the conversation, in the API's message shape
let busy = false;
let thinking = null;      // the 'thinking' line while a turn runs

// The panel is docked along the bottom like Cloud Shell. Its height goes into the
// css variable --dock-h, and the map and everything pinned to the bottom of the
// window move up by it. 'normal' is the height you dragged it to, 'min' just the
// header, 'max' nearly the whole window.
let mode = 'normal';
let height = null;          // the dragged height, remembered between sessions
const MIN_HEIGHT = 140;
const HEIGHT_KEY = 'chatDockHeight';

const EXAMPLES = [
  'Why did spot 1642419 go to cell 18223?',
  'Why is cell 2413 assigned to its class?',
  'Show me cell 18223',
];

function el(id) {
  return document.getElementById(id);
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A light rendering of the model's text: paragraphs, `code`, **bold**. Enough for
// the stories the tools return, no markdown library.
function renderText(text) {
  return esc(text)
    .split(/\n{2,}/)
    .map(p => '<p>' + p
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>') + '</p>')
    .join('');
}

// add a line to the session log and keep the prompt in view
function addLine(cls, html) {
  const div = document.createElement('div');
  div.className = cls;
  div.innerHTML = html;
  el('chatMessages').appendChild(div);
  scrollToEnd();
  return div;
}

function scrollToEnd() {
  const pane = el('chatSession');
  pane.scrollTop = pane.scrollHeight;
}

function setThinking(text) {
  if (!thinking) thinking = addLine('chat-note', '');
  thinking.textContent = text;
  // keep it the last line, below any tool line that just arrived
  el('chatMessages').appendChild(thinking);
  scrollToEnd();
}

function clearThinking() {
  if (thinking) thinking.remove();
  thinking = null;
}

function welcome() {
  const links = EXAMPLES.map(q => `<a data-q="${esc(q)}">${esc(q)}</a>`).join('<br>');
  addLine('chat-welcome',
    'Ask about this run in plain words, then press Enter. For example:<br>' + links);
}

function setBusy(b) {
  busy = b;
  el('chatPromptLine').classList.toggle('busy', b);
  if (!b) el('chatInput').focus();
}

async function send() {
  const input = el('chatInput');
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = '';
  fitInput();
  addLine('chat-q', '<span class="chat-prompt">&gt;_</span>' + esc(text));
  messages.push({ role: 'user', content: text });
  setBusy(true);
  setThinking('thinking...');
  try {
    const res = await window.electronAPI.chatSend(messages);
    if (!res.success) {
      clearThinking();
      addLine('chat-error', renderText(res.error || 'something went wrong'));
      // drop the user turn so the next question does not carry a failed one
      messages.pop();
    } else {
      messages = res.messages;
    }
  } catch (e) {
    clearThinking();
    addLine('chat-error', renderText(e.message));
    messages.pop();
  } finally {
    clearThinking();
    setBusy(false);
  }
}

function onEvent(ev) {
  if (ev.type === 'tool_call') {
    const args = Object.entries(ev.input || {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
    addLine('chat-tool', `<span class="chat-tool-name">${esc(ev.name)}</span>(${esc(args)})`);
    setThinking('looking up ' + ev.name + '...');
  } else if (ev.type === 'tool_result') {
    setThinking('thinking...');
  } else if (ev.type === 'text') {
    clearThinking();
    addLine('chat-a', renderText(ev.text));
    if (busy) setThinking('thinking...');
  }
}

// the prompt grows with what you type, like a terminal line that wraps
function fitInput() {
  const t = el('chatInput');
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 'px';
}

function showTab(pane) {
  for (const tab of document.querySelectorAll('#chatPanel .chat-tab')) {
    const on = tab.dataset.pane === pane;
    tab.classList.toggle('active', on);
    el(tab.dataset.pane).classList.toggle('active', on);
  }
  if (pane === 'chatSession') { scrollToEnd(); el('chatInput').focus(); }
}

// fill the Connection tab for a provider, the active one unless given
async function loadSettings(provider) {
  const s = await window.electronAPI.chatGetSettings(provider);
  const sel = el('chatProvider');
  if (!sel.options.length) {
    for (const p of s.providers) sel.add(new Option(p.label, p.id));
  }
  sel.value = s.provider;
  el('chatBaseUrlRow').style.display = s.provider === 'other' ? '' : 'none';
  el('chatBaseUrl').value = s.baseURL || '';
  el('chatModel').value = s.model || '';
  el('chatApiKey').value = '';
  el('chatApiKey').placeholder = s.hasKey
    ? (s.keyFromEnv ? 'using ' + s.envName + ' from the environment' : 'a key is saved; paste a new one to replace it')
    : 'paste your API key';

  // the status line is about what the chat will actually use, the active provider
  const active = s.provider === s.active ? s : await window.electronAPI.chatGetSettings(s.active);
  const label = p => (s.providers.find(x => x.id === p) || {}).label || p;
  const state = el('chatConnState');
  state.className = 'chat-conn-state ' + (active.hasKey ? 'ok' : 'none');
  state.textContent = active.hasKey
    ? 'Ready, answers come from ' + active.model + ' via ' + label(active.provider) + '.'
    : 'Not set up yet. Choose a provider, paste its API key and save.';
  return active;
}

async function saveSettings() {
  const res = await window.electronAPI.chatSaveSettings({
    provider: el('chatProvider').value,
    apiKey: el('chatApiKey').value,
    model: el('chatModel').value,
    baseURL: el('chatBaseUrl').value,
  });
  if (!res.success) {
    const state = el('chatConnState');
    state.className = 'chat-conn-state none';
    state.textContent = res.error;
    return;
  }
  const s = await loadSettings();
  if (s.hasKey) showTab('chatSession');
}

async function open() {
  el('chatPanel').classList.remove('collapsed');
  if (mode === 'min') mode = 'normal';
  applyDock();
  // first time, or no key yet: start on Connection
  const s = await loadSettings();
  showTab(s.hasKey ? 'chatSession' : 'chatConnection');
}

function close() {
  el('chatPanel').classList.add('collapsed');
  applyDock();
}

function defaultHeight() {
  let saved = null;
  try { saved = Number(localStorage.getItem(HEIGHT_KEY)); } catch {}
  return saved > 0 ? saved : Math.round(window.innerHeight / 3);
}

function clamp(h) {
  // leave at least 120 px of map above the panel
  return Math.max(MIN_HEIGHT, Math.min(h, window.innerHeight - 120));
}

// Work out the panel's height from the mode and hand it to the css. deck.gl and
// the charts listen for window resize, so fire one to make them fit the new map.
function applyDock() {
  const panel = el('chatPanel');
  let h = 0;
  if (!panel.classList.contains('collapsed')) {
    if (mode === 'min') h = panel.querySelector('.chat-header').offsetHeight;
    else if (mode === 'max') h = window.innerHeight - 120;
    else h = clamp(height);
  }
  panel.classList.toggle('minimized', mode === 'min');
  el('chatMax').title = mode === 'max' ? 'Restore' : 'Maximise';
  document.documentElement.style.setProperty('--dock-h', h + 'px');
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

// drag the grab bar on the top edge to set the height
function startResize(e) {
  e.preventDefault();
  const startY = e.clientY;
  const startH = el('chatPanel').offsetHeight;
  const move = ev => {
    height = clamp(startH + (startY - ev.clientY));
    mode = 'normal';
    applyDock();
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    try { localStorage.setItem(HEIGHT_KEY, String(height)); } catch {}
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

export function initChatPanel() {
  if (!window.electronAPI || !window.electronAPI.chatSend) return;

  el('chatBtn').addEventListener('click', () => {
    if (el('chatPanel').classList.contains('collapsed')) open(); else close();
  });
  el('chatClose').addEventListener('click', close);
  el('chatMin').addEventListener('click', () => {
    mode = mode === 'min' ? 'normal' : 'min';
    applyDock();
  });
  el('chatMax').addEventListener('click', () => {
    mode = mode === 'max' ? 'normal' : 'max';
    applyDock();
  });
  // clicking the header of a minimised panel brings it back, like Cloud Shell
  el('chatPanel').querySelector('.chat-header').addEventListener('click', e => {
    if (mode === 'min' && !e.target.closest('button')) { mode = 'normal'; applyDock(); }
  });
  el('chatResize').addEventListener('mousedown', startResize);
  window.addEventListener('resize', e => {
    // only react to the real window, not to the resize we fire ourselves
    if (e.isTrusted && !el('chatPanel').classList.contains('collapsed')) applyDock();
  });
  height = defaultHeight();

  for (const tab of document.querySelectorAll('#chatPanel .chat-tab')) {
    tab.addEventListener('click', () => showTab(tab.dataset.pane));
  }
  el('chatSaveSettings').addEventListener('click', saveSettings);
  // switching the dropdown shows that provider's settings; nothing changes until save
  el('chatProvider').addEventListener('change', e => loadSettings(e.target.value));

  const input = el('chatInput');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener('input', fitInput);
  // a click anywhere in the session goes to the prompt, as in a terminal, unless you
  // are selecting text to copy
  el('chatSession').addEventListener('click', e => {
    const q = e.target.closest('a[data-q]');
    if (q) { input.value = q.dataset.q; fitInput(); send(); return; }
    if (!window.getSelection().toString()) input.focus();
  });
  el('chatClear').addEventListener('click', () => {
    if (busy) return;
    messages = [];
    el('chatMessages').innerHTML = '';
    welcome();
    showTab('chatSession');
  });

  welcome();
  window.electronAPI.onChatEvent(onEvent);
  loadSettings();
}
