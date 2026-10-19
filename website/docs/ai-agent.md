---
title: AI agent
description: The agent that answers questions about a run, through the chat panel or an AI assistant such as Claude Code; the requirements of each and the data sent over the network.
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

An agent is a language model with access to tools. Given a task, it selects a tool,
evaluates the result and continues calling tools until the task is complete, whereas a
conventional chat model answers from its training data alone. The agent in pciSeq Viewer
has 48 tools that read the saved run on the local machine and operate the map. Its answers
are therefore derived from the run itself: why a cell was assigned its class, why a spot
was assigned to its cell, which settings were used, which cells of a class lie in a region.
The language model does not read the files directly; it receives only the tool output.

The agent is used through one of two interfaces:

- **The chat panel**, inside the viewer. The viewer calls the language model directly,
  with an API key entered in the viewer. See [Chat panel](#chat-panel).
- **An AI assistant**, such as Claude Code, Gemini CLI or Codex, started from a terminal or
  command prompt while the viewer is open. The assistant connects to the viewer over MCP
  and uses its own language model and account; no API key is entered in the viewer. See
  [AI assistant](#ai-assistant).

Both interfaces use the same tools and read the run currently loaded in the viewer.

<div v-if="big" class="zoom" @click="big = ''" role="dialog" aria-label="The video, larger">
<video :src="withBase(big)" autoplay muted loop playsinline></video>
</div>

## Requirements

The requirements depend on the interface and, for an AI assistant, on the assistant
selected; the lower block lists them for the current selection. An AI assistant is a
locally installed program that forwards questions to a language model and supports the
Model Context Protocol (MCP), for example Claude Code, Gemini CLI or Codex.

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
  <div class="pick-v">The run's output files, as loaded in pciSeq Viewer.</div>
</div>

<div class="pick-row">
  <div class="pick-label">Installation</div>
  <div class="pick-v"><a href="./installation">pciSeq Viewer</a>, from its <a href="https://github.com/acycliq/pciSeq_viewer/releases/latest">releases page</a>.</div>
</div>

<div class="pick-row" :class="{ off: where === 'panel' }">
  <div class="pick-label">Registration</div>
  <div class="pick-v">
    <template v-if="where === 'assistant'">A one-time registration adds the pciSeq Viewer MCP address to {{ toolName[tool] }}:<div class="pick-cmd"><code>{{ register[tool] }}</code><button type="button" class="pick-copy" :class="{ done: copied === register[tool] }" @click="copy(register[tool])" aria-label="Copy"><template v-if="copied === register[tool]"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></template><template v-else><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></template></button></div></template>
  </div>
</div>

<div class="pick-row">
  <div class="pick-label">API key</div>
  <div class="pick-v">
    <template v-if="where === 'panel'">Required; entered once in the <a href="#connection">Connection</a> tab.</template>
    <template v-else>Not required.</template>
  </div>
</div>

</div>
</div>

Two further access routes do not involve the viewer: the chat of the
[live viewer](https://acycliq.github.io/pciSeq_3d/api/live-viewer), available while a run
is fitting, and an AI assistant connected to `pciseq-mcp`, which reads the saved files
directly, for example on a remote machine accessed over SSH. Both are described in
[Accessing the AI agent](https://acycliq.github.io/pciSeq_3d/accessing-the-ai-agent) on the
pciSeq site.

## Chat panel

The chat button opens the panel, docked at the bottom of the window; the map is resized
to accommodate it rather than overlaid. The panel height is adjusted by dragging its top
edge. The header provides controls for text size, a new conversation, minimise, maximise
and close, and a label showing the active model.

<figure class="shot stage">
<video class="zoomable" src="/video/chat.mp4" poster="/video/chat_poster.jpg" autoplay muted loop playsinline @click="big = '/video/chat.mp4'" aria-label="The chat panel answering questions about the run: each question, the tools the agent called, and the answer"></video>
<figcaption>The chat panel answering questions about a run. The tools called by the agent are listed above each answer. Click to enlarge.</figcaption>
</figure>

Questions are entered at the prompt and sent with **Enter**. Up to three images, such as a
screenshot of a panel, can be attached by pasting or dropping them onto the panel; they are
shown above the prompt until the question is sent.

### Connection

The language model is configured once, in the **Connection** tab:

| Field | Description |
| --- | --- |
| Provider | **Anthropic** or **Z.ai (GLM)**. |
| API key | The API key for the selected provider. A separate key is stored for each provider. |
| Model | Selected from the provider's model list, or entered as the provider's model identifier. |

**save** applies the settings and switches to the Chat tab. The key is encrypted with the
operating system's credential store, is not exposed to the renderer process, and is sent
only to its provider. Usage is billed to the account associated with the key.

## AI assistant

An AI assistant, such as Claude Code, Gemini CLI or Codex, is installed separately from
the viewer. A session is started in a terminal with `claude`, `gemini` or `codex`, and
questions are entered there. The assistant is itself an agent with its own language
model. Connected to the viewer through MCP, it uses the same tools as the chat panel; the
difference lies in the language model that selects the tools and composes the answer:
in the chat panel, the model configured in the [Connection](#connection) tab; in an
assistant, the assistant's own.

<figure class="shot">
<video class="zoomable" src="/video/claude_code.mp4" poster="/video/claude_code_poster.jpg" autoplay muted loop playsinline @click="big = '/video/claude_code.mp4'" aria-label="pciSeq Viewer with a dataset loaded, a terminal opened beside it, Claude Code registered with the viewer, a session started, a question about cell 14270 answered from the viewer's tools, and the map flown to the cell"></video>
<figcaption>Claude Code with pciSeq Viewer: the one-time registration, followed by a session that queries a cell and navigates the map. Click to enlarge.</figcaption>
</figure>

To access the viewer's tools, the assistant must be registered once. Registration adds the
viewer's address, `http://127.0.0.1:8317/mcp`, to the assistant's list of MCP servers; the
command for each assistant is given under [Requirements](#requirements). The viewer
serves the tools listed below at that address while it is open.

Once registered, questions in an assistant session refer to the data currently loaded in
the viewer, and no folder needs to be specified. A question such as "Why is cell 14270 an
oligodendrocyte?" is answered from the viewer's data, and "fly to it" moves the map. No API
key is entered in the viewer; the assistant uses its own account. Any other MCP-capable
application connects in the same way, with its own registration syntax.

The server is bound to `127.0.0.1` and validates the host header of every request, so it
cannot be reached from a web page in a browser. Because the port is fixed, only one viewer
instance can serve at a time.

## Tools

The tools are not called by the user directly. A question is asked in natural language,
and the language model selects and calls the tools required, based on their descriptions;
no tool is run unless the question requires it. The same 48 tools serve the chat panel and
AI assistants.

### Explaining an assignment

| Tool | Description |
| --- | --- |
| `explain_cell` | Why a cell was assigned its class rather than the runner-up or any named class, decomposed into the gene, class prior and spatial terms |
| `explain_spot` | Why a spot was assigned to its cell, term by term, compared with every candidate cell and the background |
| `open_cell_diagnostics` | Opens the [cell diagnostics](./diagnostics#cell-diagnostics) panel on a cell |
| `open_spot_diagnostics` | Opens the [spot diagnostics](./diagnostics#spot-diagnostics) panel on a spot |

### Cell

| Tool | Description |
| --- | --- |
| `cell` | Summary of a cell: class probabilities, top genes, total counts, scale factor, neighbours |
| `cell_counts` | The soft counts of a cell, in total or for one gene |
| `cell_shape` | The fitted shape: elongation and orientation |
| `theta` | The cell scale factor under a class |
| `gamma` | The cell-gene scale factors, gene by gene, with the count each class predicts |
| `neighbours` | The cells in its spatial term, ordered by distance, with their classes |
| `spots_of_cell` | The spots assigned to the cell, with their assignment probabilities |
| `spots_in_cell` | The spots inside its segmentation mask (hard count) |
| `cell_row` | The cell's row of `cellData.tsv`, unmodified |

### Spot

| Tool | Description |
| --- | --- |
| `spot` | Gene, position and plane of a spot, its assigned cell and all candidate cells |
| `spot_row` | The spot's row of `geneData.tsv`, unmodified |

### Genes and classes

| Tool | Description |
| --- | --- |
| `gene` | One gene across the run: efficiency, misread density, spots and misreads |
| `class_counts` | Number of cells per class, hard and soft |
| `class_prior` | The prior weight of each class at convergence |
| `spots_of_class` | The spots of one gene in the cells of one class |
| `find_cells` | Cells matching filters: class, position, plane, region, total counts, assignment margin |

### The run

| Tool | Description |
| --- | --- |
| `run_info` | The pciSeq version and commit, the settings, and the convergence history |
| `metadata` | Other contents of `diagnostics.db`, such as the cell type definitions |
| `docs` | Searches or reads the pciSeq documentation saved with the run |
| `list_source` | Lists the pciSeq source on GitHub at the commit that produced the run |
| `read_source` | Reads a source file at that commit, with line numbers |

### Images and charts

| Tool | Description |
| --- | --- |
| `cell_image` | An image of a cell rendered on the background image |
| `plane_image` | The background image of a plane, or of a region of it |
| `show_figure` | Shows a figure from the pciSeq documentation, such as the terms of the spot score |
| `open_chart` | Opens one of the charts of [the drawer](./the-drawer) |
| `open_3d_view` | Opens the [3D view](./3d-view) around a cell and its neighbours |

### The map

| Tool | Description |
| --- | --- |
| `viewer_state` | The current state of the map: plane, visible area, genes, classes, settings |
| `fly_to_cell` | Moves the map to a cell and flashes its outline |
| `go_to_plane` | Moves the map to a plane |
| `show_classes` | Shows or hides cell classes |
| `show_genes` | Shows or hides the spots of genes |
| `show_all_planes` | Switches between drawing the cells of all planes and of the current plane only |
| `cells_by_gene_count` | Restricts the cells drawn to those whose total count lies in a range |
| `spot_filters` | Sets the score and intensity filters and the spot size |
| `uniform_spot_size` | Switches between uniform spot size and size by depth |
| `misread_display` | Shows, dims or hides misreads |
| `map_layers` | Toggles the background image, its channel and the cells |
| `outline_cells` | Outlines a set of cells as an [annotation](./annotations) |
| `annotations` | The current region and cell annotations |

### Files

| Tool | Description |
| --- | --- |
| `export_table` | Saves the output of a data tool as a CSV file, written by the viewer |
| `export_per_class_pngs` | Saves one PNG per class, equivalent to the button in the drawer |

### Other

| Tool | Description |
| --- | --- |
| `allen_gene_image` | The expression of a gene in the adult mouse brain, from the Allen Mouse Brain Atlas rather than the run |
| `allen_cell_type` | The Allen Institute record for a cell type, from the whole mouse brain taxonomy |
| `calculate` | Evaluates arithmetic expressions, so that numerical results are computed rather than estimated by the language model |

The pciSeq documentation of the version used is saved with the run, so `docs` returns
documentation that matches it. `list_source` and `read_source` read GitHub at the commit
that produced the run, so the source shown is the code that generated the results. These
two tools and `allen_gene_image` require a network connection; the Allen taxonomy is
bundled with the viewer.

The agent is instructed to base its explanations on the values of the run and not to
predict the outcome of a rerun with different settings. It requires a run that saved
`diagnostics.db`.

## Privacy

Only the conversation (the questions, any attached images and the earlier answers) and
the tool output are sent to the language model. The files of the run remain on the local machine. An API key, where required, is
stored locally and sent only to its provider.
