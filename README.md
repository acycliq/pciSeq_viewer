<div align="center">

# pciSeq Viewer

**A desktop application for exploring pciSeq results in 3D**

[![Documentation](https://img.shields.io/badge/docs-acycliq.github.io-0a7d5a)](https://acycliq.github.io/pciSeq_viewer/)
[![Download](https://img.shields.io/github/v/release/acycliq/pciSeq_viewer?include_prereleases&label=download)](https://github.com/acycliq/pciSeq_viewer/releases/latest)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-3776ab)](#installation)
[![Licence](https://img.shields.io/badge/licence-MIT-lightgrey)](LICENSE)

[Documentation](https://acycliq.github.io/pciSeq_viewer/) ·
[Installation](#installation) ·
[Opening a run](#opening-a-run) ·
[Web demo](https://acycliq.github.io/pciSeq_viewer/web_viewer/)

</div>

pciSeq Viewer opens the output folder of a [pciSeq](https://github.com/acycliq/pciSeq_3d)
run and draws it over the tissue image: every spot coloured by gene, every cell coloured by
the class it was assigned to, plane by plane through the z-stack. Hover a cell for its gene
counts and class probabilities, or ask the AI agent why the cell got its class.

<p align="center">
<img src="https://github.com/user-attachments/assets/f67a473a-0f84-48e7-9b4f-27be841778aa" width="100%" alt="pciSeq Viewer">
</p>

## What it does

- **Explore.** Pan and zoom a large tissue image through its planes with the spots and cell
  boundaries drawn on top. Rendered on the GPU with deck.gl, so millions of spots stay
  interactive. Show or hide any gene or cell class.
- **Inspect.** Hovering a cell shows its gene counts, its class probabilities and a chart.
  Ctrl+click a cell or a spot to open the diagnostics: the terms behind the assignment, why
  this class and not the runner up, why this cell and not the neighbour.
- **Ask.** A chat panel with an AI agent that has tools over the run: it counts cells and
  spots, explains a cell or a spot, shows or hides classes and genes, flies to a cell, draws
  charts and exports tables. It needs an API key, Anthropic or an Anthropic compatible
  endpoint. The same tools are served to Claude Code over MCP, so an agent outside the
  viewer can drive it too.
- **3D.** Select a region and render it as voxels in a separate window.
- **Charts and export.** Class and gene distributions, misread diagnostics, the scRNA-seq
  reference next to the counts the model implies, per class PNG export, custom colour
  schemes.

Everything runs locally. The data never leaves the machine, except what you send to the
chat.

## Installation

Download the installer for your platform from
[GitHub Releases](https://github.com/acycliq/pciSeq_viewer/releases/latest): Windows
(installer or portable), macOS (dmg or zip), Linux (deb or AppImage). The
[getting started](https://acycliq.github.io/pciSeq_viewer/docs/) page has the steps per
platform.

From source, with Node.js and npm installed:

```bash
git clone https://github.com/acycliq/pciSeq_viewer.git
cd pciSeq_viewer
npm install
npm start
```

## Opening a run

A run of `pciSeq.fit` with `save_data` on writes a `viewer_data` folder next to its other
outputs, with the Arrow files, the diagnostics database and, after `stage_image`, the
background tiles. Open that folder from the welcome screen, or pass it on the command line
to skip the welcome screen:

```bash
pciSeq_viewer --data=/path/to/viewer_data
```

From a source checkout: `npm start -- --data=/path/to/viewer_data`. See
[preparing data](https://acycliq.github.io/pciSeq_viewer/docs/preparing-data) for the
Python side.

## Documentation

| Section | Description |
| --- | --- |
| [Getting started](https://acycliq.github.io/pciSeq_viewer/docs/) | install on Windows, macOS or Linux |
| [Preparing data](https://acycliq.github.io/pciSeq_viewer/docs/preparing-data) | `pciSeq.fit` and `stage_image`, the two calls that make a folder the viewer can open |
| [Loading data](https://acycliq.github.io/pciSeq_viewer/docs/loading-data) | open a run, set the voxel size |
| [Using the viewer](https://acycliq.github.io/pciSeq_viewer/docs/using-the-viewer/overview) | the interface, genes and classes, the cell panel, the diagnostics, charts, the 3D view |
| [Reference](https://acycliq.github.io/pciSeq_viewer/docs/reference/data-format) | the data format and the configuration |
| [Troubleshooting](https://acycliq.github.io/pciSeq_viewer/docs/troubleshooting) | installation and data loading problems |
| [Contributing](https://acycliq.github.io/pciSeq_viewer/docs/contributing/architecture) | how the code is organised, how releases are built |

## Web demo

A browser version with a sample dataset is at
[acycliq.github.io/pciSeq_viewer/web_viewer](https://acycliq.github.io/pciSeq_viewer/web_viewer/).
The data is fetched over the network, so it takes a moment to load.

## Licence

MIT, see [LICENSE](LICENSE).
