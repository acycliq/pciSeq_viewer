---
description: An MCP server that exposes a finished pciSeq run to AI agents and other MCP clients.
---

# MCP server

pciSeq includes an MCP ([Model Context Protocol](https://modelcontextprotocol.io))
server that exposes a finished run to AI agents and other MCP clients. The server
provides tools for inspecting cell class assignments, spot assignments, counts,
scale factors and images of one run over the standard MCP stdio transport. An agent such as Claude Code
or Claude Desktop connects to it and answers questions about the run in natural
language.

The server reads the run's output folder: `diagnostics.db` and the viewer files, which
`fit` writes by default, and `cellData.tsv` and `geneData.tsv` when present. The fitted
pickle is not used.

## Installation

The server is an optional extra. It depends on the `mcp` Python package, which the
rest of pciSeq does not need:

```bash
pip install "pciSeq_3d[mcp] @ git+https://github.com/acycliq/pciSeq_3d.git@dev_3d"
```

This installs the `pciseq-mcp` command.

## Starting the server

MCP clients start the server themselves as a subprocess and communicate with it over
stdin and stdout. Example configuration for Claude Code, in `~/.claude.json`:

```json
{
  "mcpServers": {
    "pciSeq": {"type": "stdio", "command": "pciseq-mcp", "args": []}
  }
}
```

The entry is the same for every client, under the key the client expects:

| Client | Configuration file | Key |
| --- | --- | --- |
| Claude Code | `~/.claude.json` | `mcpServers` |
| Claude Desktop | `claude_desktop_config.json` in `~/Library/Application Support/Claude` (macOS), `%APPDATA%\Claude` (Windows), `~/.config/Claude` (Linux) | `mcpServers` |
| Cursor | `~/.cursor/mcp.json`, or `.cursor/mcp.json` in the project | `mcpServers` |
| VS Code with Copilot | `.vscode/mcp.json` in the workspace | `servers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| Zed | the settings file | `context_servers` |

Desktop applications do not usually inherit the shell's `PATH`; give the full path to
`pciseq-mcp` there (`which pciseq-mcp` prints it). In Claude Desktop the server
appears under **Connectors** once registered. The locations above are the clients' as
of September 2026; their own documentation is the reference.

## Usage

Questions are typed to the agent in natural language. The first call in a session is
`open_run` with the run folder; every other tool refers to the run that is open. With
Claude Code:

```bash
claude
```

```
Open the run in <output_path> and explain why spot 1642419 went to cell 18223.
```

The agent calls `open_run` on the folder, then `explain_spot`, and answers from the
result. Later questions in the same session need not name the run.

## Tools

All tools take and return the cell labels of the input segmentation, the labels shown
in the viewer. The internal labels pciSeq assigns when it renumbers a segmentation do
not appear; see [Cell identifiers](./working-with-results.md#cell-identifiers).

### Run

- `open_run(path)`: opens a run. Returns the numbers of cells, spots, genes and classes, the pciSeq version that produced it, and whether containment data is present.
- `run_info()`: provenance and settings. The pciSeq version, commit and commit date, the run date, the Python and package versions, the mean cell radius, the resolved settings, the number of iterations, and whether the loop converged.
- `metadata(key=None)`: the keys of the `metadata` table of `diagnostics.db`, or the value of one, for quantities without a tool of their own such as the reference expression and the class prior.

### Cells

- `cell(label)`: the class probabilities, top genes, total counts and scale factor of one cell, and the neighbours that enter its spatial term.
- `explain_cell(label, vs_class=None)`: the score of the assigned class against a second class, split into the gene log-likelihood, the class prior and the spatial term, with the genes contributing most to each side. Each gene is reported with the cell's count and the mean count over the cells assigned to either class. `vs_class` defaults to the runner-up.
- `cell_counts(label, gene=None)`: the counts of a cell, in total or for one gene.
- `spots_in_cell(label, gene=None)`: the spots whose pixel lies inside the cell's segmentation mask.
- `spots_of_cell(label, min_prob=None, gene=None)`: the spots whose most probable parent is the cell, each with its probability. With `min_prob`, every spot with probability above it; with `gene`, only that gene's spots.
- `cell_row(label)`: the `cellData.tsv` row of one cell.
- `theta(label)`: the cell scale factor, overall and under each of the top classes.
- `gamma(label, gene=None)`: the cell-gene scale factors under the assigned class, for every gene or for one.
- `neighbours(label)`: the cells entering the spatial term of the cell, with their classes and centroid distances.
- `class_counts(min_counts=None)`: the number of cells per class, hard and soft.
- `find_cells(class_name=None, plane=None, min_counts=None, top_two_within=None, n=50)`: the cells matching the filters, by assigned class, plane, total counts, or the gap between the top two classes.

### Spots

- `spot(spot_id)`: the gene, position, plane and candidate cells of one spot, with their probabilities.
- `explain_spot(spot_id)`: one row per candidate cell plus the background: the six score terms, their sum and the resulting probability.
- `spot_row(spot_id)`: the `geneData.tsv` row of one spot.

### Genes

- `gene(name)`: the efficiency eta and inefficiency of one gene, its misread density, its spot totals, its soft counts per class, and the cells holding most of it.

### Images

- `cell_image(label, context=False, plane=None, width=1200, channel=None, neighbours=False, save_as=None, mbtiles=None)`: a rendering of the cell on the tissue image, stitched from the viewer's `.mbtiles`: a close-up with the cell outlined in red and the other cells of the plane in blue, or with `context=True` the whole plane with the cell marked. `neighbours=True` outlines only the cells that enter the spatial term. `save_as` writes the PNG to a file.
- `plane_image(plane=None, bbox=None, width=1200, channel=None, save_as=None, mbtiles=None)`: the tissue image of one plane, whole or restricted to `bbox` in image pixels. The plane defaults to the middle of the stack. When the run has several background images, `channel` selects one by name; without it the tool lists them.

### Documentation

- `docs(query, n=5)`: the paragraphs of this documentation matching a keyword query, each with its page and heading.

Every page is also available as a resource named `pciseq-docs://<page>`, and
`pciseq-docs://index` lists them. The pages are packed into the wheel at build time from
`website/docs`; in a repository checkout the folder itself is read.

`explain_cell` and `explain_spot` return the same numbers as
[`check_cell`](./reference.md#check-cell) and [`check_spot`](./reference.md#check-spot),
which [Explaining the calls](../explaining-the-calls/overview.md) works through by hand.

## Return values

All tools return JSON-serialisable dictionaries. Errors, such as an unknown label or a
run without containment data, are returned as tool errors with a message rather than
raised.

`explain_cell` and `explain_spot` include a `narrative` field: the result in prose,
generated from the numbers, with log-likelihood differences expressed as odds. The
narrative is deterministic and is the same in the viewer's chat panel.

Two tools count the spots of a cell and give different numbers by design. `cell_counts`
returns the sum of the assignment probabilities of the spots, the quantity stored as
`CellGeneCount` in `cellData`; it is not an integer. `spots_in_cell` returns the number
of spots whose pixel lies inside the cell's mask; no probability enters it. The model
scores a spot's position against the cell centroid, not the mask, so a spot outside
every mask can still be assigned to a cell. Each result states which quantity it is.

Probabilities in `cellData.tsv` and `geneData.tsv` are stored to three decimals and
`cell_row` and `spot_row` return them as stored. `explain_spot` recomputes them at full
precision.

## Examples

The run is the Espio section used throughout the documentation.

**Why is cell 2413 `048 RHP-COA Ndnf Gaba`?** The agent calls `explain_cell(2413)`.
The result:

```
                    assigned   compared
gene log-likelihood  -674.94    -708.54
class prior            -4.33      -4.33
spatial term            4.80       0.01

for the assigned class   Ndnf +15.3   Rgs5 +15.3   Ttr +10.7   Vip +4.9
for the compared class   Npy   -7.6   Kit  -7.2   Rgs10 -3.9
```

and its `narrative`:

> Cell 2413 was called 048 RHP-COA Ndnf Gaba, with probability 1.00. The closest
> alternative was 047 Sncg Gaba, at less than 0.01. pciSeq decides a cell's class from
> three things: how well its gene counts match what each class expresses according to
> the cell type definitions (the gene log-likelihood), how common each class is to begin
> with (the prior), and what the neighbouring cells were called (the spatial term). The
> class that comes out best overall wins. The genes point to 048 RHP-COA Ndnf Gaba,
> overwhelmingly, beyond any doubt. The strongest evidence comes from Ndnf, Rgs5 and
> Ttr: the cell holds these in amounts that fit what the cell type definitions give for
> a 048 RHP-COA Ndnf Gaba cell, and not for a 047 Sncg Gaba cell. A few genes, Npy, Kit
> and Rgs10, look more like 047 Sncg Gaba, but they are outweighed. The prior treats the
> two classes alike. The neighbouring cells are mostly 048 RHP-COA Ndnf Gaba, which
> strengthens the call. So the genes settled it, and the neighbourhood agreed.

When the spatial term decides against the genes, the narrative states it. Cell 4308 is
assigned `022 L5 ET CTX Glut` although its genes favour `006 L4/5 IT CTX Glut` by about
60 to one; the neighbouring cells are L5 ET and carry the assignment.

**Why did spot 1642419 go to cell 18223?** The agent calls `explain_spot(1642419)`.
The top three candidates:

```
cell         class          Gaussian fit    class expr.  cell scale   cell-gene   prob
18223        037 DG Glut          -10.41           0.94       -0.66        0.18   0.74
21574        037 DG Glut          -12.81           0.94        0.10        0.07   0.13
17371        037 DG Glut          -12.07           0.94       -0.30       -0.54   0.10
background                                                                        0.01   misread -14.92
```

The probabilities match [Table 3.1](../explaining-the-calls/why-a-spot-got-its-cell.md#table-3-1).
All candidates are `037 DG Glut`, so the class term does not separate them; cell 18223
is the nearest and the Gaussian term decides. The narrative states this as *distance
carries the call*; when a farther cell wins because its class expresses the gene, it
states *expression carries the call*.

**How many Ndnf counts does cell 2413 have?** `cell_counts(2413, gene='Ndnf')` returns
7.77, marked as a soft count.

**Which spots belong to cell 18223?** `spots_of_cell(18223)` returns the 31 spots whose
most probable parent is the cell, with probabilities from 0.81 to 0.295. `cell_row(18223)`
lists 542 spots under `spot_id`, every spot with probability above 0.0001 on the cell;
their probabilities sum to the cell's 38.5 counts.

## Notes

Runs made before September 2026 have no `inside_cell` column, so `spots_in_cell`
returns an error, and carry no settings or convergence record, so `run_info` returns
the provenance only and `explain_spot` reports the scaled z without a plane. Runs made
before the spatial term's neighbours were saved return no neighbours from `cell`, and
`cell_image(neighbours=True)` outlines every cell near the one requested. The other
tools work on any run with a `diagnostics.db`.

The tools are plain Python functions in `pciSeq.src.mcp.tools` and can be called
without the server:

```python
from pciSeq.src.mcp.tools import open_run
run = open_run('<output_path>')
run.explain_cell(2413)
```
