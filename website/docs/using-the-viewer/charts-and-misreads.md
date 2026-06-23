---
title: Charts & Misreads
description: Cell-class and gene distribution charts, plus misread diagnostics.
---

# Charts & Misreads

The viewer ships several charts that summarise the dataset, plus controls for
inspecting and hiding misread spots.

## Cell Charts

In the **Cell Charts** section of the controls drawer:

- **Classes by Z**, cell-class distribution across z-planes, so you can see how
  cell types are layered through the stack.
- **Class Distribution**, the overall proportion of each cell class in the
  dataset.
- **Class Gene Counts**, the distribution of per-cell gene counts for each
  class, taken from the pciSeq output.

## Gene distribution

In the **Gene Controls** section, **Distribution** opens a chart of the selected
gene's spot counts (for example, counts per plane).

## Misreads

A misread is a spot that pciSeq attributes to background rather than to a cell.
The **Misreads** section gives you three charts and two display toggles.

Charts:

- **rho per Gene**, the learned misread density (rho) for each gene.
- **Assigned vs Misread**, assigned versus misread spot counts per gene.
- **Per Plane**, misread counts per plane for a selected gene.

Display toggles:

- **Grey out misreads**, keeps misread spots visible but de-emphasised.
- **Hide misreads**, removes misread spots from the map entirely.
