---
sidebar_position: 1
title: Overview
description: A tour of the pciSeq Viewer interface.
---

# Using the Viewer

Once a dataset is loaded, the viewer gives you several coordinated ways to
explore your spatial transcriptomics results in 3D. This page is a map of the
interface; each feature has its own page with the details.

:::note[Screenshots]

The pages in this section describe behaviour verified against the code. Capture
annotated screenshots/GIFs into `static/img/` and reference them as
`/img/your-image.png` to make the pages easier to follow.

:::

## The main window

- **Map**, the central view: a slippy-map background (your MBTiles image) with
  gene spots, cell boundaries, and overlays drawn on top by deck.gl. Spots show
  as coloured dots when zoomed out and morph into per-gene glyphs as you zoom in
  (see [How spots are drawn](./genes-and-cells#how-spots-are-drawn)).
- **Controls drawer**, a collapsible panel on the side. Click the rail to open
  or close it. It holds every layer, filter, and chart control, grouped into
  collapsible sections (listed below).
- **Plane navigation**, a bottom bar with previous/next buttons, a slider, and
  a `Plane: N` label for moving through the z-stack.
- **Scale bar** and **coordinate display**, show the physical scale and the
  pixel / micron coordinates under the cursor.
- **Cell search**, a search box (`Ctrl+F`) for locating a cell by its number.

## Controls drawer sections

| Section | What it does | Page |
|---|---|---|
| **Cell Classes** | Show/hide cell types, filter the list | [Genes & Cell Classes](./genes-and-cells) |
| **Cell Charts** | Class distribution by z, overall distribution, gene counts | [Charts & Misreads](./charts-and-misreads) |
| **Genes** | Show/hide genes, filter the list | [Genes & Cell Classes](./genes-and-cells) |
| **Gene Controls** | Spot size, score/intensity filters, distribution chart | [Genes & Cell Classes](./genes-and-cells) |
| **Misreads** | Misread charts and grey-out / hide toggles | [Charts & Misreads](./charts-and-misreads) |
| **Regions** | Import and manage anatomical region boundaries | [Selection & Regions](./selection-tool) |
| **Layers** | Tiles, polygons, z-projection, cell projection + export | [Layers & Export](./layers-and-export) |
| **Tools** | The rectangle selection tool | [Selection & Regions](./selection-tool) |

## Inspecting cells and spots

- Hovering a cell updates the
  **[Cell Information panel](./cell-info-panel)**, a gene-count table, donut
  chart, and class legend for that cell. Hold `Ctrl` to pin it.
- With the diagnostics database connected, **Ctrl+Click** a cell or a spot opens
  the **[Cell / Spot Inspector](./diagnostics)** for deeper per-object
  diagnostics.

## Other windows and menus

- **[3D Voxel Viewer](./voxel-viewer)**, a separate window that renders a
  selected region as voxels for a true 3D view (opened from the selection tool).
- **[Single Cell Data](./single-cell)**, view the scRNAseq reference used for
  cell typing.
- **[Custom colours](./color-import)**, import your own gene and cell-class
  colour schemes.
- **[Keyboard shortcuts](./keyboard-shortcuts)**, the full list (also under
  Help → Keyboard Shortcuts).
