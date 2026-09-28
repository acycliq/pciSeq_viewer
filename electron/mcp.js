// The chat's link to the pciSeq MCP server (pciseq-mcp), in the main process.
//
// The tools that explain a run are written once, in python, in pciSeq_3d, and
// served over MCP. The viewer does not reimplement them: it starts the server from
// the python environment the user registered with `pciseq-mcp --register`, opens
// the loaded run in it, and hands the model the server's tools and instructions.
//
// Finding the server works like Jupyter kernels. `pciseq-mcp --register`, run once
// inside the env, writes how to start it into
//     <appData>/pciseq/mcp_servers.json
// where appData is app.getPath('appData'): ~/.config on Linux, ~/Library/Application
// Support on a Mac, %APPDATA% on Windows. The python side, registry.py, uses the
// same folders.
//
// Dependencies come in through init(), so mcp.check.js can run this in plain node.

const fs = require('fs');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const CHOSEN_FIELD = 'chatMcpPython';   // the registered python the user picked
const REGISTER_HELP = 'pip install "pciSeq_3d[mcp]", then run pciseq-mcp --register ' +
  'inside that environment';

// appData: the folder above. store: electron-store. getRunPath: the loaded run's
// viewer_data folder, or null.
let deps = { appData: null, store: null, getRunPath: () => null };

// the live connection, one at a time
let conn = null;   // { client, python, name, version, instructions, tools, runPath }
let lastError = null;

function init(d) {
  deps = { ...deps, ...d };
}

function registryPath() {
  return path.join(deps.appData, 'pciseq', 'mcp_servers.json');
}

// every registered environment, each with exists: whether its python is still there
function listEnvs() {
  let servers = [];
  try {
    servers = JSON.parse(fs.readFileSync(registryPath(), 'utf8')).servers || [];
  } catch (e) {
    // no file yet: nothing registered
  }
  const chosen = deps.store ? deps.store.get(CHOSEN_FIELD, null) : null;
  return servers.map(s => ({ ...s, exists: fs.existsSync(s.python || ''), chosen: s.python === chosen }));
}

// '0.0.66.dev0+09427c5b' -> { version, commit }
function splitVersion(v) {
  const [version, commit] = String(v || '').split('+');
  return { version: version || null, commit: commit || null };
}

function status() {
  const envs = listEnvs();
  if (conn) {
    const v = splitVersion(conn.version);
    return { connected: true, name: conn.name, python: conn.python, pciseq_version: v.version,
             commit: v.commit, tools: conn.tools.length, run_open: Boolean(conn.runPath), envs };
  }
  return { connected: false, error: lastError, envs, registry: registryPath(),
           help: envs.length ? null : REGISTER_HELP };
}

async function close() {
  if (conn) {
    const c = conn;
    conn = null;
    try { await c.client.close(); } catch (e) { /* the process may be gone already */ }
  }
}

// Start the server from a registered python and open the loaded run in it. Resolves
// to status(); a failure is kept in lastError with what python printed, so the
// Connection tab can show why.
async function connect(python) {
  await close();
  lastError = null;
  const entry = listEnvs().find(e => e.python === python);
  if (!entry) {
    lastError = 'not registered: ' + python;
    return status();
  }
  if (!entry.exists) {
    lastError = 'this python no longer exists: ' + python + '. Register the environment again, ' +
      'or remove it with pciseq-mcp --unregister';
    return status();
  }
  const transport = new StdioClientTransport({
    command: entry.python,
    args: entry.args,
    env: { ...process.env, ...(entry.env || {}) },
    stderr: 'pipe',
  });
  // keep the end of what the server prints, it is the only clue when it will not start
  let stderr = '';
  if (transport.stderr) transport.stderr.on('data', b => { stderr = (stderr + b).slice(-2000); });
  const client = new Client({ name: 'pciSeq_viewer', version: '1' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    conn = { client, python: entry.python, name: entry.name, version: client.getServerVersion()?.version,
             instructions: client.getInstructions() || '', tools, runPath: null };
    if (deps.store) deps.store.set(CHOSEN_FIELD, entry.python);
    await openRun();
  } catch (e) {
    lastError = (e.message || String(e)) + (stderr ? '\n' + stderr.trim() : '');
    try { await client.close(); } catch (_) { /* nothing to close */ }
    conn = null;
  }
  return status();
}

// Open the viewer's run in the server, again when the loaded run has changed.
async function openRun() {
  if (!conn) return;
  const runPath = deps.getRunPath();
  if (!runPath || runPath === conn.runPath) return;
  const r = await conn.client.callTool({ name: 'open_run', arguments: { path: runPath } });
  if (r.isError) throw new Error('open_run: ' + textOf(r));
  conn.runPath = runPath;
}

// Connected, with the loaded run open. Starts the chosen server if nothing is
// running yet. Resolves to true or false, never throws.
async function ready() {
  try {
    if (!conn) {
      const python = defaultPython();
      if (!python) return false;
      await connect(python);
    }
    await openRun();
    return Boolean(conn);
  } catch (e) {
    lastError = e.message || String(e);
    return false;
  }
}

// Which python to start without asking: the one the user picked before, if it is
// still registered and there, or else the only registered one. With two or more
// and no earlier pick there is a real choice, and the Connection tab asks.
function defaultPython() {
  const envs = listEnvs().filter(e => e.exists);
  const chosen = deps.store ? deps.store.get(CHOSEN_FIELD, null) : null;
  if (chosen && envs.some(e => e.python === chosen)) return chosen;
  return envs.length === 1 ? envs[0].python : null;
}

function textOf(r) {
  return (r.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
}

// The server's tools in the shape the Anthropic Messages API takes. open_run is
// left out: the viewer opens the run itself, the model never needs to.
function toolsForModel() {
  if (!conn) return [];
  return conn.tools.filter(t => t.name !== 'open_run')
    .map(t => ({ name: t.name, description: t.description || '', input_schema: t.inputSchema }));
}

function hasTool(name) {
  return Boolean(conn) && conn.tools.some(t => t.name === name);
}

function instructions() {
  return conn ? conn.instructions : '';
}

// Call a server tool. Resolves to the content of a tool_result block for the
// Messages API: text stays text, a picture (cell_image, plane_image) goes as an
// image the model can see. A refusal comes back with is_error and its message.
async function callTool(name, input) {
  const r = await conn.client.callTool({ name, arguments: input || {} });
  const content = (r.content || []).map(c => {
    if (c.type === 'image') {
      return { type: 'image', source: { type: 'base64', media_type: c.mimeType, data: c.data } };
    }
    return { type: 'text', text: c.type === 'text' ? c.text : JSON.stringify(c) };
  });
  return { content, is_error: Boolean(r.isError) };
}

module.exports = { init, listEnvs, status, connect, ready, close, toolsForModel, hasTool, defaultPython,
                   instructions, callTool, registryPath, splitVersion, CHOSEN_FIELD };
