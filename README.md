# pciSeq Viewer

pciSeq Viewer shows every call of a [pciSeq](https://github.com/acycliq/pciSeq_3d) run on the
tissue, plane by plane, and explains why each cell got its class.

[Download](https://github.com/acycliq/pciSeq_viewer/releases/latest) for Windows, macOS or Linux ·
[Documentation](https://acycliq.github.io/pciSeq_viewer/)

<img src="https://github.com/user-attachments/assets/79236976-b24c-4e5c-9b93-1577d7ffe7b6" width="100%" alt="pciSeq Viewer: the section, its classes and genes, plane by plane, one cell">

## The map

The section over its tissue image, every spot coloured by its gene and every cell by the
class it was assigned to, plane by plane through the z-stack. Millions of spots stay
interactive, and any gene or class can be shown or hidden. Hover a cell for its gene counts
and class probabilities; Ctrl+Click a cell or a spot for the terms behind its call: why this
class and not the runner up, why this cell and not the neighbour.

## The 3D view

Draw a box round a region and it opens in 3D as voxels: the cells, their spots, and the
planes they span.

<img src="https://github.com/user-attachments/assets/507606e5-d075-4ff4-a3b3-633433cf2564" width="100%" alt="A box drawn round two cells and the region built in 3D">

## The agent

A chat panel that answers questions about the run in plain words. It answers from the run's
own numbers, which it reads through its tools, and it can move the map, open the diagnostics
or draw a cell. It needs an API key, Anthropic or an Anthropic compatible endpoint.
The same tools are served over MCP, so Claude Code, Gemini CLI or Codex can ask too.

> **Why is cell 22245 called 031 CT SUB Glut?**
>
> Cell 22245 is called 031 CT SUB Glut, but only just. It gets 0.51 against 0.49 for
> 030 L6 CT CTX Glut. The genes lean one way, the prior leans the other, and the two
> nearly cancel.

<img src="https://github.com/user-attachments/assets/76618be3-c5ed-4403-8c4d-3edf0a45b97f" width="100%" alt="The chat panel answering three questions about the run">

The viewer also draws class and gene charts, shows the cell type definitions next to the
counts the model implies, exports tables and a PNG per class, and takes custom colour schemes.

## Installation

Installers for Windows (installer or portable), macOS (dmg or zip) and Linux (deb or
AppImage) are on the [releases page](https://github.com/acycliq/pciSeq_viewer/releases/latest).
From source, with Node.js and npm:

```bash
git clone https://github.com/acycliq/pciSeq_viewer.git
cd pciSeq_viewer
npm install
npm start
```

## Opening a run

`pciSeq.fit` with `save_data` on writes a `viewer_data` folder. Open it from the welcome
screen, or skip the welcome screen with

```bash
pciSeq_viewer --data=/path/to/viewer_data
```

From a source checkout: `npm start -- --data=/path/to/viewer_data`. The background image is a
separate, optional step, see
[Loading the data](https://acycliq.github.io/pciSeq_viewer/docs/loading-data).

## Documentation

[acycliq.github.io/pciSeq_viewer](https://acycliq.github.io/pciSeq_viewer/), and in it:

- [The map](https://acycliq.github.io/pciSeq_viewer/docs/the-map), the window and its controls
- [The 3D view](https://acycliq.github.io/pciSeq_viewer/docs/3d-view), a region as voxels
- [Diagnostics](https://acycliq.github.io/pciSeq_viewer/docs/diagnostics), why a cell got its class and a spot its cell
- [AI agent](https://acycliq.github.io/pciSeq_viewer/docs/ai-agent), the chat panel, AI assistants such as Claude Code, and what each needs
- [Data format](https://acycliq.github.io/pciSeq_viewer/docs/reference/data-format), the files the viewer reads

## Citation

The method behind the calls:

Qian, X., Harris, K. D., Hauling, T., Nicoloutsopoulos, D., Muñoz-Manchado, A. B., Skene, N.,
Hjerling-Leffler, J., & Nilsson, M. (2020). Probabilistic cell typing enables fine mapping of
closely related cell types in situ. *Nature Methods*, 17(1), 101-106.

## Licence

MIT, see [LICENSE](LICENSE).
