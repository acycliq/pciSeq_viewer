---
description: Ask an agent about a finished pciSeq run over the Model Context Protocol.
---

# MCP server

The MCP server connects an AI assistant, such as Claude Code or Claude Desktop, to a
finished pciSeq run. The assistant can then answer questions about the run: why a cell
was given its class, why a spot went to the cell it did, how many reads a cell holds,
which spots sit inside it. The connection uses the
[Model Context Protocol](https://modelcontextprotocol.io).

The server reads the run's output folder. It needs `diagnostics.db` and the viewer
files, which `fit` writes by default, and uses `cellData.tsv` and `geneData.tsv` when
they are present. The fitted pickle is not used.

## Installation

The server is an optional extra, since it brings in a web server stack that the rest
of pciSeq does not need:

```bash
pip install "pciSeq_3d[mcp] @ git+https://github.com/acycliq/pciSeq_3d.git@dev_3d"
```

This adds a `pciseq-mcp` command to the path.

## Registering the server

The agent starts the server itself over stdio. For Claude Code, add it to
`~/.claude.json`:

```json
"mcpServers": {
  "pciSeq": {"type": "stdio", "command": "pciseq-mcp", "args": []}
}
```

For Claude Desktop, the same entry goes in `claude_desktop_config.json`, and the server
then appears in the app under **Connectors**. Desktop applications do not usually share
the shell's `PATH`, so give the full path to the command there; `which pciseq-mcp`
prints it.

A new session of the agent lists the server under its tools. The first call in a
session is `open_run` with the run folder; every other tool refers to the run that is
open. If `pciseq-mcp` exits saying the mcp library is missing, the extra was not
installed; see [Installation](#installation) above.

The server is not tied to Claude. It speaks the Model Context Protocol over stdio, so
any client that supports MCP can use it. Each client reads its own file and nothing
else, so `~/.claude.json` is for Claude Code only; the entry inside is the same
everywhere, the `pciseq-mcp` command with no arguments, under the key the client
expects:

| Client | File | Key |
| --- | --- | --- |
| Claude Code | `~/.claude.json` | `mcpServers` |
| Claude Desktop | `claude_desktop_config.json` in `~/Library/Application Support/Claude` on macOS, `%APPDATA%\Claude` on Windows, `~/.config/Claude` on Linux | `mcpServers` |
| Cursor | `~/.cursor/mcp.json`, or `.cursor/mcp.json` in the project | `mcpServers` |
| VS Code with Copilot | `.vscode/mcp.json` in the workspace | `servers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| Zed | the settings file, `zed: open settings file` | `context_servers` |

These locations are the clients' as of September 2026; their own documentation is the
reference if one has moved.

## Asking a question

The question is typed to the agent, in plain language. Nothing is imported and no
notebook is involved: the agent runs the tools and answers in prose.

With Claude Code, open a terminal and start it:

```bash
claude
```

then type the question, naming the run the first time:

```
Open the run in <output_path> and tell me why spot 1642419 went to cell 18223.
```

The agent calls `open_run` on that folder, then `explain_spot`, and replies with the
story and the numbers behind it. Later questions in the same session refer to the run
that is open, so "how many Ndnf reads does cell 2413 have" is enough on its own.

With Claude Desktop the same question goes into a chat. The server shows under
**Connectors** once it is registered, and the agent asks for the run folder if the
question does not name one.

The functions behind the tools can also be called from Python directly, with no agent
at all; see [Notes](#notes).

## Tools

All tools take and return the cell labels of the input segmentation, the same numbers
the viewer shows. The internal labels pciSeq uses when it renumbers a segmentation
never appear, see [Cell identifiers](./working-with-results.md#cell-identifiers).

| Tool | Returns |
| --- | --- |
| `open_run(path)` | Opens a run and returns its size, the pciSeq version that made it, and whether it carries containment data. |
| `run_info()` | What produced the run and how it ended: version and commit, the resolved settings, the number of iterations and whether the loop converged. |
| `cell(label)` | The class probabilities, top genes, total counts and scale factor of one cell, and the neighbours its spatial term listens to. |
| `explain_cell(label, vs_class=None)` | The score of the assigned class against another, split into the gene log-likelihood, the class prior and the spatial term, with the genes that pushed hardest for each side, each with the cell's count and the mean count of cells typed as either class. `vs_class` defaults to the runner up. |
| `explain_spot(spot_id)` | One row per candidate cell plus the background: the six score terms, their sum and the resulting probability. |
| `cell_counts(label, gene=None)` | The reads a cell holds, in total or for one gene. |
| `spots_in_cell(label, gene=None)` | The spots whose pixel falls inside the cell's segmentation mask. |
| `spots_of_cell(label, min_prob=None)` | The spots whose most likely parent is the cell, each with its probability. With `min_prob`, every spot with probability above it. |
| `cell_row(label)` | The `cellData.tsv` row of one cell, value for value. |
| `spot_row(spot_id)` | The `geneData.tsv` row of one spot, value for value. |
| `cell_image(label, context=False, plane=None, width=1200, channel=None, neighbours=False, save_as=None, mbtiles=None)` | A picture of the cell on the tissue image, stitched from the viewer's `.mbtiles`: a close-up with the cell outlined in red and the other cells of that plane in blue, or with `context=True` the whole plane with a ring round the cell. `neighbours=True` outlines only the cells the spatial term listens to. `save_as` also writes the png to a file. |
| `plane_image(plane=None, bbox=None, width=1200, channel=None, save_as=None, mbtiles=None)` | The tissue image of one plane with nothing drawn on it: the whole plane, or with `bbox` a region of it in image pixels. The plane defaults to the middle of the stack. When the run has more than one background image (one `.mbtiles` each, e.g. DAPI and GCaMP), `channel` picks one by name, here and in `cell_image`; without it the tool lists the images so the agent can ask which. A run with a single background image always uses it, since its name cannot say which stain it is. |
| `docs(query, n=5)` | The paragraphs of this documentation that match a keyword query, each naming its page. |

`explain_cell` and `explain_spot` return the same numbers as
[`check_cell`](./reference.md#check-cell) and [`check_spot`](./reference.md#check-spot),
which the [Explaining the calls](../explaining-the-calls/overview.md) pages work
through by hand.

### Soft and hard counts

Two of the tools count the reads of a cell and give different numbers on purpose.

`cell_counts` is the sum of the assignment probabilities of the spots, the same
quantity as `CellGeneCount` in `cellData`. It is not a whole number. A spot that
belongs to a cell with probability 0.3 contributes 0.3.

`spots_in_cell` counts the spots whose pixel falls inside the cell's mask. It is a
whole number and no probability enters it. The model scores a spot's position against
the cell centroid, not the mask, so a spot outside every cell can still be assigned to
one, and many are.

Every answer from either tool says which of the two it is.

## Examples

The run is a fit of the Espio section used throughout the documentation. The agent is
asked in plain language; the tool calls and the substance of the answers are shown.

**Why is cell 2413 `048 RHP-COA Ndnf Gaba`?** The agent calls `explain_cell(2413)`
and answers in words. The tool returns a `narrative` alongside the numbers, built from
them, so that the story is the same whoever asks:

> Cell 2413 was called 048 RHP-COA Ndnf Gaba, with probability 1.00. The closest
> alternative was 047 Sncg Gaba, at less than 0.01. pciSeq decides a cell's class from
> three things: how well its gene counts match what each class typically expresses (the
> gene log-likelihood), how common each class is to begin with (the prior), and what the
> neighbouring cells were called (the spatial term). The class that comes out best
> overall wins. The genes point to 048 RHP-COA Ndnf Gaba, overwhelmingly, beyond any
> doubt. The strongest evidence comes from Ndnf, Rgs5 and Ttr: the cell holds these in
> the amounts a 048 RHP-COA Ndnf Gaba cell typically does and a 047 Sncg Gaba cell does
> not. A few genes, Npy, Kit and Rgs10, look more like 047 Sncg Gaba, but they are
> outweighed. The prior treats the two classes alike. The neighbouring cells are mostly
> 048 RHP-COA Ndnf Gaba, which strengthens the call. So the genes settled it, and the
> neighbourhood agreed.

The numbers behind it:

```
                    assigned   compared
gene log-likelihood  -674.94    -708.54
class prior            -4.33      -4.33
spatial term            4.80       0.01

for the assigned class   Ndnf +15.3   Rgs5 +15.3   Ttr +10.7   Vip +4.9
for the compared class   Npy   -7.6   Kit  -7.2   Rgs10 -3.9
```

The same tool tells the opposite story when it applies. Cell 4308 on this run is
`022 L5 ET CTX Glut`, yet on its genes alone it looks more like `006 L4/5 IT CTX Glut`,
about 60 to one; the neighbouring cells are overwhelmingly L5 ET, and they carry the
call. The narrative says so: *this call is the neighbourhood overruling the genes*, and
names the class the genes alone would have picked.

**Why did spot 1642419 go to cell 18223?** The agent calls `explain_spot(1642419)`.
The probabilities match [Table 3.1](../explaining-the-calls/why-a-spot-got-its-cell.md#table-3-1),
and the `narrative` tells the story:

> Spot 1642419 is a Synpr spot. It was assigned to cell 18223, fairly confidently, with
> probability 0.74. The next candidates are cell 21574 (0.13), cell 17371 (0.10), and
> the chance it is a misread is 0.01. pciSeq weighs each nearby cell on two things: how
> close the spot is to the cell's centre (the Gaussian fit), and how well a Synpr spot
> fits that cell, which combines whether the cell's class expresses Synpr (class
> expression), whether the cell holds more reads overall than its class predicts (cell
> scale), and whether it already holds more Synpr than its class predicts (cell-gene
> scale). The background is scored on how often Synpr spots turn out to be misreads. The
> best total wins. Cell 18223 is the nearest candidate: about 5 to one over cell 17371
> and about 11 to one over cell 21574 on position alone. Every candidate is a 037 DG
> Glut cell, so on class alone Synpr fits them all equally; what separates them is how
> much each already holds. Between the top two, cell 21574 holds more reads overall than
> its class predicts. So cell 21574 is the better fit for the gene, slightly, but cell
> 18223 is closer, about 11 to one, and distance carries the call.

The numbers behind it, for the top three candidates:

```
cell         class          Gaussian fit    class expr.  cell scale   cell-gene   prob
18223        037 DG Glut          -10.41           0.94       -0.66        0.18   0.74
21574        037 DG Glut          -12.81           0.94        0.10        0.07   0.13
17371        037 DG Glut          -12.07           0.94       -0.30       -0.54   0.10
background                                                                        0.01   misread -14.92
```

Cell 18223 wins on distance. Every candidate here is `037 DG Glut`, so the class term
cannot separate them, and cell 21574 holds more reads than its class predicts, which
is why it takes some of the probability. When the balance goes the other way, a spot
going to a cell that is not the nearest because that cell's class expresses the gene
and the nearer one does not, the narrative says *expression carries the call*.

**How many Ndnf reads does cell 2413 have?** `cell_counts(2413, gene='Ndnf')` returns
7.77, with the note that this is a soft count, the sum of the assignment probabilities
of the Ndnf spots.

**Which spots belong to cell 18223?** `spots_of_cell(18223)` returns the 31 spots
whose most likely parent is the cell, with probabilities from 0.81 down to 0.295, and
notes that the lowest is well under one half: the cell is those spots' best guess,
not a certainty. `cell_row(18223)` lists 542 spots under `spot_id`, every spot with
probability above 0.0001 on the cell. Their probabilities sum to the cell's 38.5
counts. The two lists answer different questions.

## Documentation

The server also carries this documentation, so that an agent without a browser can
check how something works before explaining it. Every page is a resource named
`pciseq-docs://<page>`, for instance `pciseq-docs://api/working-with-results.md`, and
`pciseq-docs://index` lists them all with their titles. The `docs` tool searches them by
keyword and returns the matching paragraphs, each with the resource to read for the
whole page. It is a plain text search over 33 pages, with no index to build or keep
current.

The pages are packed into the wheel at build time from the `website/docs` folder, so an
installed pciSeq has the same pages as the site it was built from. In a repository
checkout the folder itself is read.

## Notes

Runs made before September 2026 have no `inside_cell` column, so `spots_in_cell`
refuses with a message saying so, and carry no settings or convergence record in
`diagnostics.db`, so `run_info` gives only the version and commit and `explain_spot`
reports the scaled z without a plane. Runs made before the spatial term's neighbours
were saved return no neighbours from `cell`, and `cell_image` with `neighbours=True`
outlines every cell near the one asked about instead. The other tools work on any run
that has `diagnostics.db`.

Probabilities in `cellData.tsv` and `geneData.tsv` are kept to three decimals, and
`cell_row` and `spot_row` return what the files hold. `explain_spot` recomputes them
at full precision, so it is the tool to use when a probability below 0.0005 matters.

The tools are plain Python functions in `pciSeq.src.mcp.tools`, usable without the
server:

```python
from pciSeq.src.mcp.tools import open_run
run = open_run('<output_path>')
run.explain_cell(2413)
```
