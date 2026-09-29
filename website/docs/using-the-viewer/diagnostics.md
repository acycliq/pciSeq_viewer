---
title: Diagnostics (Cell & Spot Inspectors)
description: Inspect why a cell or spot was assigned as it was, using the diagnostics database.
---

# Diagnostics

The viewer can read a per-run **diagnostics database** (`diagnostics.db`,
produced during data preparation) to explain *why* pciSeq assigned a cell or
spot the way it did. Two inspectors surface this: **check_cell** and
**check_spot**.

::: tip Python equivalent
The Cell and Spot Inspectors present the same diagnostics as pciSeq's
[`check_cell`](https://acycliq.github.io/pciSeq_3d/api/reference#check-cell) and
[`check_spot`](https://acycliq.github.io/pciSeq_3d/api/reference#check-spot)
methods. Refer to the pciSeq API reference to compute them programmatically.
:::

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

**Ctrl+Click a spot** to open the Spot Inspector. It shows how pciSeq assigned the
spot, to one of its nearest cells or to the background. The panel has three parts:

- **Assignment probabilities.** The probability of each candidate cell and of the
  background.
- **Score decomposition.** One bar per candidate cell, split into the terms of its
  score: Gaussian fit, class expression, cell scale, cell-gene scale, gene efficiency
  and inside-cell bonus. A tick marks the total. The last bar is the background, and
  its whole score is the misread term. Higher is better.
- **Score breakdown.** The same numbers as a table, with the sum and the probability
  of each row.

The terms are described in
[How a spot's call was made](https://acycliq.github.io/pciSeq_3d/explaining-the-calls/why-a-spot-got-its-cell).

::: info Requires diagnostics data

If Ctrl+Click does nothing, the diagnostics database is not connected. Check
that your dataset has a `diagnostics/diagnostics.db`, or connect one via
**Diagnostics → Setup…**.

:::
