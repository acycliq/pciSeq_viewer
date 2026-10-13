<div align="center">

# pciSeq Viewer

**A desktop application for exploring pciSeq results in 3D**

[![Documentation](https://img.shields.io/badge/docs-acycliq.github.io-0a7d5a)](https://acycliq.github.io/pciSeq_viewer/)
[![Download](https://img.shields.io/github/v/release/acycliq/pciSeq_viewer?include_prereleases&label=download)](https://github.com/acycliq/pciSeq_viewer/releases/latest)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-3776ab)](#installation)
[![Licence](https://img.shields.io/badge/licence-MIT-lightgrey)](LICENSE)

[Documentation](https://acycliq.github.io/pciSeq_viewer/) ·
[Installation](#installation) ·
[Loading the data](#loading-the-data) ·
[Web demo](https://acycliq.github.io/pciSeq_viewer/web_viewer/)

</div>

pciSeq Viewer opens the output folder of a [pciSeq](https://github.com/acycliq/pciSeq_3d)
run and draws it over the tissue image: every spot coloured by gene, every cell coloured by
the class it was assigned to, plane by plane through the z-stack. Hover a cell for its gene
counts and class probabilities, or ask the AI agent why the cell got its class.

<p align="center">
<img src="https://github.com/user-attachments/assets/79236976-b24c-4e5c-9b93-1577d7ffe7b6" width="100%" alt="pciSeq Viewer: the section, its classes and genes, plane by plane, one cell">
</p>

<table>
<tr>
<td width="33%" align="center"><a href="https://github.com/user-attachments/assets/79236976-b24c-4e5c-9b93-1577d7ffe7b6"><img src="https://github.com/user-attachments/assets/7ba100ae-4eb7-4a11-8523-c832f44ec392" width="100%" alt="Explore"></a><br><b>Explore</b><br>every spot, every cell, plane by plane</td>
<td width="33%" align="center"><a href="https://github.com/user-attachments/assets/507606e5-d075-4ff4-a3b3-633433cf2564"><img src="https://github.com/user-attachments/assets/bff644c3-255d-4620-af5d-e099d04ee9b9" width="100%" alt="See it in 3D"></a><br><b>See it in 3D</b><br>a region as voxels, a cell and its spots inside</td>
<td width="33%" align="center"><a href="https://github.com/user-attachments/assets/76618be3-c5ed-4403-8c4d-3edf0a45b97f"><img src="https://github.com/user-attachments/assets/b7bde1d7-5cde-48db-9f86-b13f8b263719" width="100%" alt="Ask the run"></a><br><b>Ask the run</b><br>an agent with tools over the results</td>
</tr>
</table>

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

## Loading the data

A run of `pciSeq.fit` with `save_data` on writes a `viewer_data` folder next to its other
outputs, with the Arrow files and the diagnostics database. The background image is a
separate step, optional: `stage_image` cuts the microscopy image, a 2D image or a z-stack,
into an `.mbtiles` file in the same folder. Each `.mbtiles` in the folder is a channel the
viewer can switch to, DAPI and a second stain for example.

```python
from skimage import io
dapi = io.imread('/path/to/dapi.tif')                # (Z, H, W), or (H, W) for a 2D image
pciSeq.stage_image(img=dapi, out_dir='/path/to/viewer_data', name='dapi')
```

Open the folder from the welcome screen, or pass it on the command line to skip the
welcome screen:

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
