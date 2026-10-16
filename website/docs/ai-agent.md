---
title: AI agent
description: The agent that answers questions about a run, from the chat panel or from an AI assistant such as Claude Code, what each way needs, and what is sent over the network.
---

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { withBase } from 'vitepress'

// requirements: the two ways through the viewer. One selection per row, and the
// lower block lists what that selection needs. A row that does not apply fades.
const where = ref('assistant')   // 'panel' | 'assistant'
const tool = ref('claude')       // 'claude' | 'gemini' | 'codex'
const toolName = { claude: 'Claude Code', gemini: 'Gemini CLI', codex: 'Codex' }
const register = {
  claude: 'claude mcp add --transport http pciseq-viewer http://127.0.0.1:8317/mcp',
  gemini: 'gemini mcp add --transport http pciseq-viewer http://127.0.0.1:8317/mcp',
  codex:  'codex mcp add pciseq-viewer --url http://127.0.0.1:8317/mcp',
}
// the videos: a click shows one as large as the screen allows, the column is
// narrower than the clips, so their text is small in the page
const big = ref('')
const onKey = (e) => { if (e.key === 'Escape') big.value = '' }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const copied = ref('')
const copy = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    copied.value = text
    setTimeout(() => { if (copied.value === text) copied.value = '' }, 1500)
  })
}
</script>

# AI agent

An agent is a language model with tools. It is given a task in the prompt, decides which
tool to call, reads what the tool returns, and goes on calling tools until the task is
done. A chat, in contrast, answers from what the language model already knows. The
agent here has 47 tools that read the saved run on the user's machine and act on the map, so
its answers come from the run itself: why a cell got its class, why a spot went to the
cell it did, what a setting was, which cells of a class sit in a region. The language
model never reads the files; it only sees what the tools return.

<figure class="shot">
<video class="zoomable" src="/video/chat.mp4" poster="/video/chat_poster.jpg" autoplay muted loop playsinline @click="big = '/video/chat.mp4'" aria-label="The chat panel answering questions about the run: each question, the tools the agent called, and the answer"></video>
<figcaption>The chat panel answering questions about a run. Each tool the agent called is listed above its answer, so what was looked up is visible. A click on the video shows it larger.</figcaption>
</figure>

<div v-if="big" class="zoom" @click="big = ''" role="dialog" aria-label="The video, larger">
<video :src="withBase(big)" autoplay muted loop playsinline></video>
</div>

## Requirements

The requirements depend on the interface and, for an AI assistant, on the assistant.
The lower block lists them for the selection. An AI assistant is a program on the user's
machine that sends questions to a language model and supports the Model Context
Protocol (MCP), such as Claude Code, Gemini CLI or Codex.

<div class="pick" role="group" aria-label="Requirements">

<div class="pick-row">
  <div class="pick-label">Interface</div>
  <div class="pick-opts">
    <button type="button" :class="{ on: where === 'panel' }" :aria-pressed="where === 'panel'" @click="where = 'panel'">chat panel</button>
    <button type="button" :class="{ on: where === 'assistant' }" :aria-pressed="where === 'assistant'" @click="where = 'assistant'">AI assistant</button>
  </div>
</div>

<div class="pick-row" :class="{ off: where !== 'assistant' }">
  <div class="pick-label">Assistant</div>
  <div class="pick-opts">
    <button v-for="(name, k) in toolName" :key="k" type="button" :class="{ on: tool === k }" :disabled="where !== 'assistant'" :aria-pressed="tool === k" @click="tool = k">{{ name }}</button>
  </div>
</div>

<div class="pick-out">

<div class="pick-row">
  <div class="pick-label">Reads</div>
  <div class="pick-v">The saved files, as loaded in pciSeq Viewer.</div>
</div>

<div class="pick-row">
  <div class="pick-label">Installation</div>
  <div class="pick-v"><a href="./installation">pciSeq Viewer</a>, from its <a href="https://github.com/acycliq/pciSeq_viewer/releases/latest">releases page</a>.</div>
</div>

<div class="pick-row" :class="{ off: where === 'panel' }">
  <div class="pick-label">Registration</div>
  <div class="pick-v">
    <template v-if="where === 'assistant'">{{ toolName[tool] }} is registered with pciSeq Viewer, once, by adding the address of pciSeq Viewer to {{ toolName[tool] }}:<div class="pick-cmd"><code>{{ register[tool] }}</code><button type="button" class="pick-copy" :class="{ done: copied === register[tool] }" @click="copy(register[tool])" aria-label="Copy"><template v-if="copied === register[tool]"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></template><template v-else><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></template></button></div></template>
  </div>
</div>

<div class="pick-row">
  <div class="pick-label">API key</div>
  <div class="pick-v">
    <template v-if="where === 'panel'">Required, entered once on the <a href="#connection">Connection</a> tab.</template>
    <template v-else>Not required. {{ toolName[tool] }} uses its own account.</template>
  </div>
</div>

</div>
</div>

Two more ways do not go through the viewer: the chat of the
[live viewer](https://acycliq.github.io/pciSeq_3d/api/live-viewer), while a run is still
fitting, and an AI assistant connected to `pciseq-mcp`, which reads the saved files
without the viewer, on a remote machine reached over ssh for example. Both are on the
pciSeq site's
[Accessing the AI agent](https://acycliq.github.io/pciSeq_3d/accessing-the-ai-agent).

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
| API key | The key with that provider. Each provider keeps its own. |
| Model | Picked from the provider's list, or typed as the provider writes it. |

**Save** applies it and switches to the Chat tab. The key is stored encrypted on this
computer, with the operating system's own store, and never reaches the page; it is
sent only to the provider it belongs to. The environment variables `ANTHROPIC_API_KEY`
and `ZAI_API_KEY` are used when no key has been saved. Usage is billed to the key.

## AI assistant

An AI assistant is a program of its own, separate from the viewer and installed on its
own: Claude Code, Gemini CLI or Codex. A session is started in a terminal, by typing
`claude`, `gemini` or `codex` at the command prompt, and the questions are typed there.
The assistant is an agent too, with its own language model. Connected to the viewer
through MCP, it uses the viewer's tools, the same as the chat panel; what differs is
which language model decides which tools to call and writes the answer. In the chat panel it
is the one chosen on the [Connection](#connection) tab, in an assistant the
assistant's own.

<figure class="shot">
<video class="zoomable" src="/video/claude_code.mp4" poster="/video/claude_code_poster.jpg" autoplay muted loop playsinline @click="big = '/video/claude_code.mp4'" aria-label="pciSeq Viewer on a run, a terminal opened beside it, Claude Code registered with the viewer, a session started, a question about cell 14270 answered from the viewer's tools, and the map flown to the cell"></video>
<figcaption>Claude Code with pciSeq Viewer: the registration, once, then a session that asks about a cell and moves the map. A click on the video shows it larger.</figcaption>
</figure>

For Claude Code, Gemini CLI or Codex to reach the viewer and use its tools, the
assistant has to be registered with the viewer, once. Registration adds the viewer's
address, `http://127.0.0.1:8317/mcp`, to the assistant's list of MCP servers; the
command for each assistant is under [Requirements](#requirements). The viewer answers
on that address, and offers the tools below, while it is open.

From then on, with the viewer open, a question in an assistant session is about the run
on screen, and the folder does not need naming. "Why is cell 14270 an oligodendrocyte" is
answered from the viewer's files, and "fly to it" moves the map. No API key is entered
in the viewer for this; the assistant uses its own account. Any other application that
supports MCP connects the same way; only the form of the registration command differs.

The server is bound to `127.0.0.1` and checks the host of every request, so a web page
in a browser cannot reach it. Only one viewer can serve at a time, since the port is
fixed.

## Tools

The tools are never called by the user. A question is asked in plain words, and the
language model chooses the tools it needs, from their descriptions, and calls them;
nothing is run unless a question needs it. The list shows what the agent can look up
and do. The same 47 serve the chat panel and an AI assistant.

### Explaining a call

| Tool | What it does |
| --- | --- |
| `explain_cell` | Why a cell got its class, gene by gene, against the runner up or any class named: the genes, the class prior and the spatial term |
| `explain_spot` | Why a spot went to its cell, term by term, against every candidate cell and the background |
| `open_cell_diagnostics` | Opens the [cell diagnostics](./diagnostics#cell-diagnostics) panel on a cell |
| `open_spot_diagnostics` | Opens the [spot diagnostics](./diagnostics#spot-diagnostics) panel on a spot |

### One cell

| Tool | What it does |
| --- | --- |
| `cell` | The headline facts: class probabilities, top genes, total counts, scale factor, neighbours |
| `cell_counts` | The soft counts of a cell, in total or for one gene |
| `cell_shape` | The fitted shape: round or elongated, by how much, and which way it points |
| `theta` | The cell scale factor under a class |
| `gamma` | The cell-gene scale factors, gene by gene, with the count each class predicts |
| `neighbours` | The cells in its spatial term, nearest first, with their classes |
| `spots_of_cell` | The spots that belong to it, with their probabilities |
| `spots_in_cell` | The spots that sit inside its segmentation mask, a hard count |
| `cell_row` | Its row of `cellData.tsv`, value for value |

### One spot

| Tool | What it does |
| --- | --- |
| `spot` | Its gene, position and plane, the cell it went to and every candidate |
| `spot_row` | Its row of `geneData.tsv`, value for value |

### Genes and classes

| Tool | What it does |
| --- | --- |
| `gene` | One gene across the run: efficiency, misread density, spots and misreads |
| `class_counts` | The cells of each class, hard and soft |
| `class_prior` | The prior weight of each class at the end of the run |
| `spots_of_class` | The spots of one gene in the cells of one class |
| `find_cells` | The cells matching filters: class, position, plane, region, total counts, how close the call is |

### The run

| Tool | What it does |
| --- | --- |
| `run_info` | The pciSeq version and commit, the settings, and how the run converged |
| `metadata` | Anything else in `diagnostics.db`, the cell type definitions for example |
| `docs` | Searches or reads the pciSeq pages saved with the run |
| `list_source` | Lists the pciSeq source on GitHub, at the commit that made the run |
| `read_source` | Reads a source file at that commit, with line numbers |

### Pictures and charts

| Tool | What it does |
| --- | --- |
| `cell_image` | A picture of a cell on the background image |
| `plane_image` | The background image of a plane, or of a region of it |
| `open_chart` | Opens one of the charts of [the drawer](./the-drawer) |
| `open_3d_view` | Opens the [3D view](./3d-view) round a cell and its neighbours |

### The map

| Tool | What it does |
| --- | --- |
| `viewer_state` | What the map shows now: plane, area in view, genes, classes, settings |
| `fly_to_cell` | Moves the map to a cell and flashes its outline |
| `go_to_plane` | Moves the map to a plane |
| `show_classes` | Shows or hides cell classes |
| `show_genes` | Shows or hides the spots of genes |
| `show_all_planes` | Draws the cells of every plane at once, or one plane again |
| `cells_by_gene_count` | Draws only the cells whose total count is in a range |
| `spot_filters` | Sets the score and intensity filters and the spot size |
| `uniform_spot_size` | Draws every spot at the same size, or back to sizing by depth |
| `misread_display` | Shows, greys out or hides the misreads |
| `map_layers` | Turns the background, its channel and the cells on or off |
| `outline_cells` | Outlines a set of cells as an [annotation](./annotations) |
| `annotations` | The regions and cell annotations on the map now |

### Files

| Tool | What it does |
| --- | --- |
| `export_table` | Saves the rows of a data tool to a CSV file; the viewer writes the file itself |
| `export_per_class_pngs` | Saves one PNG per class, the same as the button in the drawer |

### Other

| Tool | What it does |
| --- | --- |
| `allen_gene_image` | Where a gene is expressed in the adult mouse brain, from the Allen Mouse Brain Atlas, not from the run |
| `allen_cell_type` | Allen's record for a cell type, from the whole mouse brain taxonomy |
| `calculate` | Arithmetic, so that a sum or an exponential is computed rather than guessed |

The pciSeq pages the run was fitted with are saved inside it, so `docs` reads the
documentation that matches the run. `list_source` and `read_source` read GitHub at the
commit that made the run, so the code shown is the code that produced the numbers. These
two and `allen_gene_image` need a network connection; the Allen taxonomy comes with the
viewer.

The agent is told to explain as a mentor would, from the numbers, and never to promise
what a rerun with other settings would give. It needs a run that saved its
`diagnostics.db`; without it there is nothing to read.

## Privacy

Only the question, the images attached to it and the results of the tools are sent
to the language model. The files of the run stay on the user's machine. An API key, where one
is needed, is saved on this computer and sent only to its provider.
