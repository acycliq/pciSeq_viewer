---
title: AI chat
description: The chat panel, in which a language model answers questions about the run with functions that read the saved files and act on the map, and the viewer as an MCP server for an AI assistant.
---

# AI chat

The chat bubble at the top right of the map opens a panel in which questions about the
run are answered in plain words: why a cell got its class, why a spot went to the cell
it did, what a setting was, which cells of a class sit in a region. A language model
writes the answers, but it does not read the files itself. It has a list of functions
that read the saved run on your machine, picks the one a question needs, and writes the
answer from what the function returned.

<figure class="shot">
<img src="/img/chat.png" alt="The chat panel docked under the map, with a question about a cell, the functions it called and the answer">
<figcaption>The panel docks under the map. Each function the model called is listed above its answer, so what was looked up is visible.</figcaption>
</figure>

The same agent can be reached in three other ways, from the chat of the live viewer
while a run is still fitting, or from an AI assistant such as Claude Code, with or
without the viewer open. The pciSeq site's
[Accessing the AI agent](https://acycliq.github.io/pciSeq_3d/accessing-the-ai-agent)
compares the four and shows the path of a question. This page is about the two that
go through the viewer.

## Chat panel

The bubble opens the panel docked along the bottom of the window; the map shrinks above
it rather than being covered. Drag its top edge to change its height, or use the
buttons in its header: smaller and larger text, a new conversation, minimise, maximise,
close. The tag in the header names the model answering.

A question is typed on the prompt line and sent with **Enter**. An image can go with
it, pasted or dropped onto the panel, a screenshot of a panel for example; up to three,
shown as chips above the prompt until the question is sent.

### Connection

The **Connection** tab is where the model is chosen, once:

| Field | What goes in it |
| --- | --- |
| Provider | **Anthropic**, **Z.ai (GLM)**, or **Other** for any service that speaks Anthropic's Messages API, with its address in the field that appears. |
| API key | Your key with that provider. Each provider keeps its own. |
| Model | Picked from the provider's list, or typed as the provider writes it. |

**Save** applies it and switches to the Chat tab. The key is stored encrypted on this
computer, with the operating system's own store, and never reaches the page; it is
sent only to the provider it belongs to. The environment variables `ANTHROPIC_API_KEY`
and `ZAI_API_KEY` are used when no key has been saved. Usage is billed to the key.

Only the question, the images attached to it and the results of the functions are sent
to the provider. The files of the run stay on the machine.

### Functions

The functions the model may call, grouped. It chooses among them from their
descriptions; nothing is run unless a question needs it.

- **Explain a call.** Why a cell got its class, gene by gene, against the runner up or
  any class you name; why a spot went to its cell rather than another, term by term.
  The same numbers as [the inspectors](./inspectors), which it can open on request.
- **Facts about the run.** One cell, its shape, its counts, its scale factors, its
  neighbours and the spatial term; one spot and its candidates; one gene across the run,
  its efficiency and misread density; the cells per class, the class prior, the
  settings, the version and the commit that made the run, whether it converged.
- **Find cells.** By class, by position, by plane, by a region you drew, by how
  uncertain the call is, by total counts. The rows of such a list can be saved to a CSV
  file; the viewer writes the file itself, nothing is copied by the model.
- **The documentation.** The pciSeq pages the run was fitted with are saved inside it,
  and the model reads them before explaining a term or a setting. It can also read the
  pciSeq source code on GitHub at the commit that made the run, so the code it shows is
  the code that produced the numbers. That one needs a network connection.
- **Pictures.** A cell on the background image, close up or in the whole section; a
  plane or a region of it. They are drawn in the chat.
- **The map.** Fly to a cell, outline a set of cells as an
  [annotation](./annotations), show or hide classes and genes, draw the cells of all
  planes, open one of the charts of the drawer, open the [3D view](./3d-view) round a
  cell, save one picture per class.
- **Arithmetic**, so that a sum or an exponential is computed rather than guessed.

The model is told to explain as a mentor would, from the numbers, and never to promise
what a rerun with other settings would give. It needs a run that saved its
`diagnostics.db`; without it there is nothing to read.

## MCP server

An AI assistant on the same machine can ask the viewer the same questions, and move the
map, through the Model Context Protocol. The viewer listens on `localhost` while it is
open, port 8317, and exposes the functions above. Register it once with the assistant;
for Claude Code:

```bash
claude mcp add --transport http pciseq-viewer http://127.0.0.1:8317/mcp
```

From then on a question to Claude Code about the run open in the viewer, "why is cell
14270 an oligodendrocyte", is answered from the viewer's files, and "fly to it" moves
the map. No API key is entered in the viewer for this; the assistant has its own.

Gemini CLI and Codex register the same address with their own `mcp add` command, see
the [registration commands](https://acycliq.github.io/pciSeq_3d/accessing-the-ai-agent#requirements)
on the pciSeq site. The server is bound to `127.0.0.1` and checks the host of every
request, so a web page in a browser cannot reach it.
