---
title: Overview
description: What pciSeq Viewer is, the data it reads, and where each component is documented.
---

# pciSeq Viewer

pciSeq Viewer is a desktop application for the output of a completed
[pciSeq](https://acycliq.github.io/pciSeq_3d/) run. It draws the spots and cells over the
background image, one plane at a time, and renders selected regions in 3D. Every
assignment can be inspected, either by clicking on it or by querying the agent; both use
the same diagnostics as pciSeq's `check_cell` and `check_spot`.

It is distinct from the [live viewer](https://acycliq.github.io/pciSeq_3d/api/live-viewer),
which runs in a browser while `fit` is in progress and shows the class assignments as they
converge. pciSeq Viewer is used afterwards, on the saved output.

## Main components

- **[The map](./the-map).** The main window: the background image, the cell outlines
  filled with the colour of their class, the spots drawn with one glyph per gene, and a
  plane slider. Hovering over a cell shows its gene counts and class probabilities.
  [The drawer](./the-drawer) at the side contains the gene, class, chart and layer
  controls.
- **[The 3D view](./3d-view).** A rectangle drawn on the map opens a second window in
  which that region of tissue is rendered as voxels: the cells, their boundaries and the
  spots, in a scene that can be rotated and sliced.
- **[The diagnostics](./diagnostics).** Ctrl-clicking a cell or a spot opens a panel with
  the terms behind its assignment, as returned by pciSeq's own diagnostics.
- **[The AI agent](./ai-agent).** A chat panel in which a language model answers
  questions about the run, using tools that read the saved files and operate the map.
  AI assistants such as Claude Code can connect to the viewer in the same way.

The `?` button at the top right of the window opens a description of the viewer, from which
a guided tour of the controls can be started; **Help, Take a Tour** in the menu starts the
tour directly.

## Requirements

A run of pciSeq `0.0.66` or later, from the `dev_3d` branch, with `save_data` enabled.
Earlier runs do not write `diagnostics.db`, which the diagnostics and the agent require.
[Loading the data](./loading-data) lists the files a run writes and describes how the
background image is added.
