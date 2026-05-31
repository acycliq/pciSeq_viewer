---
sidebar_position: 3
title: Cell Information Panel
description: Inspect a single cell's gene counts, class probabilities, and legend.
---

# Cell Information Panel

Hovering a cell updates the **Cell Information** panel in the bottom-right
corner. It summarises everything pciSeq inferred about that one cell.

## What it shows

The panel has three columns:

- **Gene counts table**, the genes detected in the cell and their (weighted)
  counts, sortable and compact.
- **Donut chart**, the cell's class-assignment probabilities as a ring, so you
  can see at a glance how confident the typing is and which classes competed.
- **Class legend**, the colours for the classes in the donut, scrollable when a
  cell has many candidate classes.

## Pinning the panel

By default the panel follows whichever cell you hover. **Hold `Ctrl`** to
pin / unpin it, so it keeps showing one cell while you move around the map.

## Highlighting

Hovering a cell also highlights it on the map, making it easy to keep track of
the cell whose details you are reading.

:::note[Screenshot]

Capture the Cell Information panel for a cell with several candidate classes
(showing the table, donut, and legend together). Save as
`static/img/cell-info-panel.png`.

:::

## Related

- For per-cell **diagnostics** (comparing the assigned class against another),
  see the [Cell Inspector](./diagnostics), opened with **Ctrl+Click** when the
  diagnostics database is connected.
