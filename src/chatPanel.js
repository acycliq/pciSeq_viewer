/**
 * The chat panel: ask the run a question in plain words.
 *
 * The renderer side only draws and relays. The model call and the tool calls run in
 * the main process (electron/chat.js), reached through window.electronAPI.chatSend;
 * the steps along the way arrive as chat events so the user sees what was looked up.
 * The conversation is kept here in the API's shape and handed back whole on every
 * turn, so the model has the context of earlier questions.
 */

let messages = [];        // the conversation, in the API's message shape
let busy = false;

function el(id) {
  return document.getElementById(id);
}

// A light rendering of the model's text: paragraphs, `code`, **bold**. Enough for
// the stories the tools return, no markdown library.
function renderText(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc(text)
    .split(/\n{2,}/)
    .map(p => '<p>' + p
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>') + '</p>')
    .join('');
}

function addBubble(role, html) {
  const box = el('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg chat-' + role;
  div.innerHTML = html;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function addToolRow(name, input) {
  const args = Object.entries(input || {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
  return addBubble('tool', `<span class="chat-tool-name">${name}</span>(${args})`);
}

function setStatus(text) {
  const s = el('chatStatus');
  if (s) s.textContent = text || '';
}

function setBusy(b) {
  busy = b;
  el('chatSendBtn').disabled = b;
  el('chatInput').disabled = b;
}

async function send() {
  const input = el('chatInput');
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = '';
  addBubble('user', renderText(text));
  messages.push({ role: 'user', content: text });
  setBusy(true);
  setStatus('thinking');
  try {
    const res = await window.electronAPI.chatSend(messages);
    if (!res.success) {
      addBubble('error', renderText(res.error || 'something went wrong'));
      // drop the user turn so the next question does not carry a failed one
      messages.pop();
    } else {
      messages = res.messages;
    }
  } catch (e) {
    addBubble('error', renderText(e.message));
    messages.pop();
  } finally {
    setBusy(false);
    setStatus('');
  }
}

function onEvent(ev) {
  if (ev.type === 'tool_call') {
    addToolRow(ev.name, ev.input);
    setStatus('looking up ' + ev.name);
  } else if (ev.type === 'tool_result') {
    setStatus('thinking');
  } else if (ev.type === 'text') {
    addBubble('assistant', renderText(ev.text));
  } else if (ev.type === 'error') {
    setStatus('');
  }
}

async function loadSettings() {
  const s = await window.electronAPI.chatGetSettings();
  el('chatModel').value = s.model || '';
  el('chatApiKey').value = '';
  el('chatApiKey').placeholder = s.hasKey
    ? (s.keyFromEnv ? 'using ANTHROPIC_API_KEY from the environment' : 'a key is saved; paste a new one to replace it')
    : 'paste your Anthropic API key';
  el('chatSettings').classList.toggle('open', !s.hasKey);
}

async function saveSettings() {
  const key = el('chatApiKey').value;
  const model = el('chatModel').value;
  const res = await window.electronAPI.chatSaveSettings({ apiKey: key, model });
  if (!res.success) {
    addBubble('error', renderText(res.error));
    return;
  }
  await loadSettings();
  el('chatSettings').classList.remove('open');
}

function open() {
  el('chatPanel').classList.remove('collapsed');
  el('chatInput').focus();
}

function close() {
  el('chatPanel').classList.add('collapsed');
}

export function initChatPanel() {
  if (!window.electronAPI || !window.electronAPI.chatSend) return;

  el('chatBtn').addEventListener('click', () => {
    const panel = el('chatPanel');
    if (panel.classList.contains('collapsed')) open(); else close();
  });
  el('chatClose').addEventListener('click', close);
  el('chatSendBtn').addEventListener('click', send);
  el('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  el('chatSettingsToggle').addEventListener('click', () => el('chatSettings').classList.toggle('open'));
  el('chatSaveSettings').addEventListener('click', saveSettings);
  el('chatClear').addEventListener('click', () => {
    messages = [];
    el('chatMessages').innerHTML = '';
  });

  window.electronAPI.onChatEvent(onEvent);
  loadSettings();
}
