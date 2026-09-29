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
    tools: tools.TOOLS.map(t => ({
      name: t.name, description: t.description, inputSchema: t.input_schema,
    })),
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

// What the agent is told: the same persona the built-in chat runs on, plus the one
// difference, that this agent sits outside the viewer.
function instructions() {
  return chat.SYSTEM + '\n\n' + [
    'You are connected to a running pciSeq viewer through its MCP server. The run',
    'the user has loaded is already open in the tools, and fly_to_cell,',
    'open_cell_diagnostics, open_spot_diagnostics, show_classes and show_genes act',
    'on the viewer window the user is looking at.',
  ].join('\n');
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

module.exports = { start, stop, DEFAULT_PORT, PATH };
