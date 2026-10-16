// The viewer as an MCP server, so an outside agent such as Claude Code can ask
// about the loaded run AND control the screen: fly the map to a cell, open the
// cell diagnostics. The tools are the same ones the built-in chat uses (tools.js),
// so the two agents can never disagree about a number.
//
// It listens on localhost only, while the viewer is open with a run loaded. Claude
// Code connects to it as an http server; register it once with:
//
//     claude mcp add --transport http pciseq-viewer http://127.0.0.1:8317/mcp
//
// or in ~/.claude.json:  "pciseq-viewer": { "type": "http", "url": "http://127.0.0.1:8317/mcp" }
//
// Protection: bound to 127.0.0.1, and the SDK's DNS rebinding protection checks
// the Host header, so a web page in a browser cannot reach it cross-origin. Every
// request is handled statelessly, one server and transport per request, which is
// the SDK's recommended shape for a server without per-session state.

const http = require('http');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const tools = require('./tools');
const chat = require('./chat');

const DEFAULT_PORT = 8317;
const PATH = '/mcp';

let httpServer = null;

// One MCP server per request: no session state to keep, and a crash in one
// request cannot wedge the rest.
function makeServer() {
  const server = new Server(
    { name: 'pciSeq viewer', version: '1' },
    { capabilities: { tools: {} }, instructions: instructions() },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.TOOLS.map(listed),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const out = await tools.call(req.params.name, req.params.arguments || {});
    if (out && out.__image) {
      return { content: [
        { type: 'image', data: out.__image.data, mimeType: out.__image.media_type },
        { type: 'text', text: JSON.stringify(out.info) },
      ] };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(out) }],
      isError: Boolean(out && out.error),
    };
  });
  return server;
}

// What the agent is told. Claude Code cuts a server's instructions at 4,096
// characters (2.1.296 on), and the full persona, chat.SYSTEM, is about 22,000, so
// almost all of it, the screen rules included, never reached it. So the server sends
// this core: the rules for every answer and the screen rules, each sentence copied
// word for word from chat.SYSTEM, the same as CORE in the python server
// (pciSeq/src/mcp/server_instructions.py), minus what is no use here (open_run,
// the run is open) and a few sentences dropped for room. The first paragraph is the
// server's own. tests/mcp_core.check.js checks every sentence is in chat.SYSTEM and
// that the whole stays under 4,000 characters, so it is never cut. The built-in chat
// still sends chat.SYSTEM whole.
const CORE = [
  ['You are connected to a running pciSeq viewer through its MCP server.',
   'The run the user has loaded is already open in the tools, and the screen tools act on the viewer window the user is looking at.'],
  ['For anything about how pciSeq works, a term, or a setting, call docs first: the pages are where your facts come from, never your memory.',
   'But the user can read the docs themselves, so never hand a page back to them, reworded or in the page\'s own order, and never write "the docs say" or "the page says".',
   'You have read the page; now explain the idea as a mentor would, in your own words.',
   'Start from what the thing is for and the problem it solves, give a picture or an example a biologist would recognise, and say what it means for the user\'s own cells.',
   'Leave out what was not asked for: function names, line numbers, and the names of distributions and priors stay out unless the user asks how it is computed.'],
  ['Never promise what a rerun with different settings would give.'],
  ['Cell labels are always the numbers of the segmentation, the ones the user knows, never internal indices.',
   'Counts are soft, weighted by assignment probability, unless a tool says it is a hard count.'],
  ['In every answer, about a result or about the method, speak as a mentor would, a neuroscientist who knows spatial transcriptomics well and wants the user to understand how the model reached its decision.',
   'Say what happened and why in plain words, and use the numbers to support the story rather than as the story.',
   'Quote numbers as the tools return them, but never show the tools\' field names, such as sum_favouring_assigned or mean_in_compared, to the user; say in words what the number is.',
   'Never do arithmetic in your head, not even adding a few up: the totals of the two gene lists are sum_favouring_assigned and sum_favouring_compared, and for any other number the tools do not give, use calculate.',
   'Do not attach any unit to a log-likelihood or to a difference of two, not nats and not "log-likelihood units"; say odds, or a word.',
   'No equation: a formula puts off the people this is written for, and the words carry it.'],
  ['Open every answer about a quantity or a setting with the need for it: the question it answers and what would go wrong without it, in one or two sentences, before anything else.',
   'Nobody cares how a thing works until they know why they need it, so where it sits among the others and how it works come after.'],
  ['Never call a value loose, tight, high or low by comparing it with the default; give the default only as a fact, when asked.',
   'Never say that eta, theta or gamma is near 1, stays at 1 or is pulled toward 1 without saying what 1 means: no correction.',
   'Give the number the run holds, observed over expected, say what it is in those terms, and then at the end of the answer check with the user that this is the one they meant, since someone new to the method may have had the other way round in mind.'],
  ['When you describe the Zero class, say what it is: not a recognisable cell type, the class that expects no expression, for a cell with zero or few reads that no real class explains.',
   'Such a cell can be a real cell of a type the gene panel does not target.',
   'Do not call it background or segmentation noise; the model does not know that.'],
  ['viewer_state tells you what the map shows now: the plane, the area in view, the genes and classes drawn, the spot settings, how misreads are drawn and the layers.',
   'Call it before saying anything about the screen, and after a screen tool to say what changed.',
   'You cannot see the screen.',
   'Never say where spots or cells sit on the map, or what the user should see there, unless a tool returned their positions; counts per class are not positions.',
   'Never say something was done on the screen, shown, hidden, outlined, moved or opened, unless a tool call in this same answer did it and came back without an error.'],
].map(paragraph => paragraph.join(' ')).join('\n\n');

function instructions() {
  return CORE;
}

// The rules for one kind of question, attached to the tool that question calls, for
// an agent that gets only CORE. The same passages as TOOL_RULES in the python server
// (pciSeq/src/mcp/server_instructions.py), cut out of chat.SYSTEM by where they start
// and end, so the words are the persona's own and there is no second copy. Only the
// MCP listing gets them: the built-in chat sends the whole persona already.
// tests/mcp_core.check.js fails when a start or an end no longer matches.
const TOOL_RULES = {
  gamma: [['For gamma: cells of the same class', 'gamma is that allowance.'],
          ['After saying why gamma is needed', 'is the count more or less than its class predicts?'],
          ['Eta, theta and gamma are all the same statistic', 'give gamma as the correction the model settled on.']],
  theta: [['When an answer about theta calls a cell bigger or smaller', 'never leave it as size.'],
          ['Never say that eta, theta or gamma is near 1', 'tells a newcomer nothing about why 1 matters.']],
  run_info: [['Explain rTheta, rGene and rSpot as pseudo-counts', 'give the default only as a fact, when asked.']],
  docs: [['The four corrections that rescale', 'and the words carry it.'],
         ['When asked why counts are not whole numbers', '0.3 give 4.3.']],
  gene: [['All four are called inefficiencies in pciSeq', 'may have had the other way round in mind.']],
  // the cell type definitions sentence too: unlike the python one, this core left it out
  explain_cell: [['Cover the genes, the prior and the neighbourhood', 'say odds, or a word.'],
                 ['The cell type definitions are the mean expression', 'unless the user says so.'],
                 ['A little background on what a class is', 'use the class name as given.'],
                 ['explain_cell and explain_spot return a narrative field', 'do not give every answer the same shape.']],
  explain_spot: [['explain_cell and explain_spot return a narrative field', 'do not give every answer the same shape.']],
  calculate: [['You may work out, from the current numbers', 'and that only a rerun can tell.']],
};

function toolRules(name) {
  const text = chat.SYSTEM.replace(/\s+/g, ' ');
  return (TOOL_RULES[name] || []).map(([start, end]) => {
    const i = text.indexOf(start);
    const j = i < 0 ? -1 : text.indexOf(end, i);
    if (i < 0 || j < 0) throw new Error(`the rules for ${name} no longer match the persona: ${start} ... ${end}`);
    return text.slice(i, j + end.length);
  }).join(' ');
}

// a tool as the MCP listing shows it: its own description and the persona's rules
function listed(t) {
  const rules = toolRules(t.name);
  return { name: t.name, description: rules ? t.description + '\n\n' + rules : t.description, inputSchema: t.input_schema };
}

function start(port) {
  if (httpServer) return Promise.resolve(port);
  return new Promise((resolve, reject) => {
    httpServer = http.createServer(async (req, res) => {
      if (new URL(req.url, 'http://127.0.0.1').pathname !== PATH) {
        res.writeHead(404).end();
        return;
      }
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,        // stateless
          enableDnsRebindingProtection: true,
          allowedHosts: ['127.0.0.1:' + port, 'localhost:' + port],
        });
        const server = makeServer();
        res.on('close', () => { transport.close(); server.close(); });
        await server.connect(transport);
        await transport.handleRequest(req, res);
      } catch (e) {
        console.error('MCP request failed:', e.message);
        if (!res.headersSent) res.writeHead(500).end();
      }
    });
    httpServer.once('error', (e) => { httpServer = null; reject(e); });
    // localhost only: nothing on the network can reach it
    httpServer.listen(port, '127.0.0.1', () => {
      console.log('MCP server for outside agents: http://127.0.0.1:%d%s', port, PATH);
      resolve(port);
    });
  });
}

function stop() {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

module.exports = { start, stop, DEFAULT_PORT, PATH, CORE, TOOL_RULES, toolRules, listed };
