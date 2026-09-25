---
title: Layers & Export
description: Toggle background tiles and polygons, project across z, and export per-class images.
---

# Layers & Export

The **Layers** section of the controls drawer decides which spatial layers are
drawn and offers two projection modes plus an image export.

## Base layers

- **Background**, show/hide the background microscopy image (the MBTiles tiles).
  Shortcut: `T`. A dataset can have more than one background image, see
  [Background channels](#background-channels) below.
- **Cells**, show/hide the cell boundary polygons. Shortcut: `P`. An
  **Opacity** slider controls the polygon fill.

### Background channels

Each `.mbtiles` in the data folder is one background channel, for example a DAPI
and a GCaMP image of the same section. When there is more than one, radio buttons
in the top right corner of the map switch between them, with a short cross-fade.
One channel is shown at a time; the channels are never overlaid.

Each channel is labelled by its mbtiles `name` and tinted by its mbtiles `tint`
metadata, so a GCaMP channel can render green while DAPI stays grayscale.
Channels with no `tint` are shown grayscale.

The channel shown when the dataset opens is the first `.mbtiles` in order of file
name. `dapi.mbtiles` opens before `gcamp.mbtiles`. Upper case sorts before lower
case, so `GCaMP.mbtiles` would open before `dapi.mbtiles`. To open on a different
channel, rename the files so that it sorts first.

## All Planes (z-projection)

- **All Planes** toggle, overlays information from other z-planes onto the
  current view, with an **Overlay** opacity slider (`10%` to `80%`). Use it to see
  structure that spans several planes without leaving the current one.

## Cell Projection

- **Cell Projection** toggle, switches to a mode that projects cells by class,
  useful for answering "where does this cell type live?" across the stack.
- **Min Genes / Max Genes** sliders, restrict the projection to cells whose
  gene count falls in the chosen range.

### Per-class image export

While Cell Projection is active, **Export per-class PNGs** captures one PNG per
cell class and bundles them into a single ZIP download. For each class the
exporter isolates that class, lets the map redraw, captures the canvas, then
restores your original selection at the end. The status text next to the button
reports progress.

::: tip Why a single ZIP

Bundling every class into a single ZIP avoids a per-file save dialog, which
would otherwise interrupt panning and zooming. The PNGs are exported with a
transparent background.

:::
