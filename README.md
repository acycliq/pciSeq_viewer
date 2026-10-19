<div align="center">

# pciSeq Viewer

**Desktop application for visualising and interpreting pciSeq results, in 3D**

[![Documentation](https://img.shields.io/badge/docs-acycliq.github.io-0a7d5a)](https://acycliq.github.io/pciSeq_viewer/docs/)
[![Release](https://img.shields.io/github/v/release/acycliq/pciSeq_viewer)](https://github.com/acycliq/pciSeq_viewer/releases/latest)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-informational)](https://github.com/acycliq/pciSeq_viewer/releases/latest)
[![Licence](https://img.shields.io/badge/licence-MIT-lightgrey)](LICENSE)

[Download](https://github.com/acycliq/pciSeq_viewer/releases/latest) ·
[Try the demo data](#try-it-yourself) ·
[Documentation](https://acycliq.github.io/pciSeq_viewer/docs/)

</div>

Companion application to visualise results from [pciSeq](https://github.com/acycliq/pciSeq_3d).

## The viewer

- **The map.** Each plane of the z-stack is displayed over its background image, with spots
  coloured by gene and cells coloured by their assigned class. Millions of spots can be
  displayed at once, and the visibility of each gene and each class can be set independently.
  Hovering over a cell displays its gene counts and class probabilities. Ctrl+Click on a cell
  or a spot opens the diagnostics, which show the terms that determined the assignment: for a
  cell, the comparison of the assigned class with the runner-up; for a spot, the comparison of
  the assigned cell with the other candidate cells and the background.
- **The 3D view.** A region selected with a bounding box is displayed in three dimensions as
  voxels, together with its cells, its spots and the planes they span.

<img src="https://github.com/user-attachments/assets/79236976-b24c-4e5c-9b93-1577d7ffe7b6" width="100%" alt="pciSeq Viewer: the section, its classes and genes, plane by plane, one cell">

## The AI agent

A conversational interface to the fitted model, intended to make its assignments
interpretable. On request, the agent provides a decomposition of cell-to-class and
spot-to-cell assignments into their constituent terms, so that each assignment can be traced
to the data and priors that determined it. The structure of the model and the estimation of
its latent variables may likewise be queried. The agent also controls the viewer: navigation
to a cell or plane, the visibility of genes and classes, and the diagnostics, chart and 3D
views.

<img src="https://github.com/user-attachments/assets/76618be3-c5ed-4403-8c4d-3edf0a45b97f" width="100%" alt="The chat panel answering three questions about the run">

## Try it yourself

Download the installer for your platform from the
[releases page](https://github.com/acycliq/pciSeq_viewer/releases/latest). The viewer comes with
a demo run: on the welcome screen, click **Try the demo data** (a 600 MB download).

Use of the agent requires either an API key for a supported language-model provider or a
connection through an AI assistant such as Claude Code; the requirements for each are described
in the [documentation](https://acycliq.github.io/pciSeq_viewer/docs/ai-agent#ai-agent).

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

The background image is a separate, optional step; see
[Loading the data](https://acycliq.github.io/pciSeq_viewer/docs/loading-data).

## Documentation

Full documentation is available [here](https://acycliq.github.io/pciSeq_viewer/docs/).

## Licence

MIT, see [LICENSE](LICENSE).
