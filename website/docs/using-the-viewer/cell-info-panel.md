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

## Freezing the panel

By default the panel follows whichever cell you hover. **Click a cell** to
freeze the panel on it, so it keeps showing that cell while you move around the
map. Press **`Esc`** or click an empty part of the map to unfreeze and resume
following the cursor.

## Highlighting

Hovering a cell also highlights it on the map, making it easy to keep track of
the cell whose details you are reading.

## Related

- For per-cell **diagnostics** (comparing the assigned class against another),
  see the [Cell Inspector](./diagnostics), opened with **Ctrl+Click** when the
  diagnostics database is connected.
