---
sidebar_position: 8
title: Diagnostics (Cell & Spot Inspectors)
description: Inspect why a cell or spot was assigned as it was, using the diagnostics database.
---

# Diagnostics

The viewer can read a per-run **diagnostics database** (`diagnostics.db`,
produced during data preparation) to explain *why* pciSeq assigned a cell or
spot the way it did. Two inspectors surface this: **check_cell** and
**check_spot**.

## Connecting the diagnostics database

When you open a dataset, the viewer auto-discovers the diagnostics database in
the dataset's `diagnostics/` folder. You can also point it at one manually via
**Diagnostics → Setup…** in the menu bar.

The inspectors only work once the database is connected.

## Cell Inspector (check_cell)

**Ctrl+Click a cell** to open the Cell Inspector. It compares the cell's
**assigned** class against any other class you choose:

1. The panel shows the assigned class.
2. Pick a class under **Compare against** and click **Compare**.
3. The results show how the evidence (genes and scores) differs between the two
   classes, rendered as diverging charts and a table.

Use it to understand borderline assignments, for example a cell that was nearly
typed as a different, closely related class.

## Spot Inspector (check_spot)

**Ctrl+Click a spot** to open the Spot Inspector. It shows the spot's candidate
neighbouring cells and the per-cell scores pciSeq used to assign it (such as the
multivariate-normal term, attention, and expression fluctuation), as tables and
charts.

:::note[Requires diagnostics data]

If Ctrl+Click does nothing, the diagnostics database is not connected. Check
that your dataset has a `diagnostics/diagnostics.db`, or connect one via
**Diagnostics → Setup…**.

:::
