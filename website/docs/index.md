---
title: Overview
description: What pciSeq Viewer is, what it reads, and where each part of it is documented.
---

# pciSeq Viewer

pciSeq Viewer is a desktop application for the output of a finished
[pciSeq](https://acycliq.github.io/pciSeq_3d/) run. It draws the spots and the cells over
the background image, one plane at a time, and builds a selected region in 3D. Every call
can be inspected, by clicking on it or by asking the agent: both read the same diagnostics
as pciSeq's `check_cell` and `check_spot`.

It is not the [live viewer](https://acycliq.github.io/pciSeq_3d/api/live-viewer). The
live viewer runs in a browser while `fit` is still going and shows the classes as they
settle. This one is opened afterwards, on the saved output.

## Main components

- **[The map](./the-map).** The main window: the background image, the cell outlines
  filled with the colour of their class, the spots as one glyph per gene, and a slider
  through the planes. Hover a cell and a panel shows its gene counts and its class
  probabilities. [The drawer](./the-drawer) at the side holds the genes, the classes,
  the charts and the layers.
- **[The 3D view](./3d-view).** A rectangle drawn on the map opens a second window with
  that piece of tissue built from voxels: the cells, their boundaries and the spots,
  with depth, in a scene that can be turned and sliced.
- **[The diagnostics](./diagnostics).** Ctrl-click a cell or a spot and a panel opens with
  the terms behind its call, the ones pciSeq's own diagnostics return.
- **[The AI agent](./ai-agent).** A chat panel in which a language
  model answers questions about the run, with functions that read the saved files and
  act on the map. An AI assistant such as Claude Code can connect to the viewer the same
  way.

The `?` button at the top right of the window, or **Help, Take a Tour** in the menu,
starts a tour of the controls.

## Requirements

A run of pciSeq `0.0.66` or newer, the `dev_3d` branch, with `save_data` on. Older runs
have no `diagnostics.db`, so the diagnostics and the agent have nothing to read.
[Loading the data](./loading-data) lists what the run writes and how the background
image is added.
