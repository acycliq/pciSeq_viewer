# pciSeq Viewer

Every call of a [pciSeq](https://github.com/acycliq/pciSeq_3d) run on the tissue, plane by
plane, and why each cell got its class.

**[Download](https://github.com/acycliq/pciSeq_viewer/releases/latest)** for Windows, macOS or
Linux and **[try it on the demo data](#try-it-yourself)**, or read the
**[documentation](https://acycliq.github.io/pciSeq_viewer/docs/)**.

## The map and the 3D view

- **The map.** The section over its tissue image, plane by plane through the z-stack: every
  spot coloured by its gene, every cell by the class it was assigned to. Millions of spots stay
  interactive, and any gene or class can be shown or hidden. Hover a cell for its gene counts
  and class probabilities; Ctrl+Click a cell or a spot for the terms behind its call: why this
  class and not the runner up, why this cell and not the neighbour.
- **The 3D view.** Draw a box round a region and it opens in 3D as voxels: the cells, their
  spots, and the planes they span.

<img src="https://github.com/user-attachments/assets/79236976-b24c-4e5c-9b93-1577d7ffe7b6" width="100%" alt="pciSeq Viewer: the section, its classes and genes, plane by plane, one cell">

## The AI agent

A chat panel for questions about the statistical model behind the results. It explains the
latent variables the model estimates and the assignments: why a cell was assigned its class
rather than the runner-up, how much the genes, the class prior and the neighbouring cells each
contributed, and why a spot was assigned to its cell. The agent can act on the viewer while
answering: navigating to a cell or a plane, showing or hiding genes and classes, and opening the
diagnostics, the charts or the 3D view, or rendering a cell on the background image.

<img src="https://github.com/user-attachments/assets/76618be3-c5ed-4403-8c4d-3edf0a45b97f" width="100%" alt="The chat panel answering three questions about the run">

## Try it yourself

Download the installer for your platform from the
[releases page](https://github.com/acycliq/pciSeq_viewer/releases/latest). The viewer comes with
a demo run: on the welcome screen, click **Try the demo data** (a 600 MB download).

Use of the agent requires either an API key for a supported language-model provider or a
connection through an AI assistant such as Claude Code; the requirements for each are described
in the [documentation](https://acycliq.github.io/pciSeq_viewer/docs/ai-agent#requirements).

## Install

Installers are on the [releases page](https://github.com/acycliq/pciSeq_viewer/releases/latest):
Windows (installer or portable), macOS (dmg or zip) and Linux (deb or AppImage).

From source, with Node.js and npm:

```bash
git clone https://github.com/acycliq/pciSeq_viewer.git
cd pciSeq_viewer
npm install
npm start
```

## Loading the data

`pciSeq.fit` with `save_data` on writes a `viewer_data` folder, which is loaded from the
welcome screen or directly from the command line:

```bash
pciSeq_viewer --data=/path/to/viewer_data

# from a source checkout
npm start -- --data=/path/to/viewer_data
```

The background image is a separate, optional step, see
[Loading the data](https://acycliq.github.io/pciSeq_viewer/docs/loading-data).

## Documentation

Full documentation is available [here](https://acycliq.github.io/pciSeq_viewer/docs/).

## Licence

MIT, see [LICENSE](LICENSE).
