---
title: Diagnostics
description: Ctrl-clicking a cell or a spot opens a panel with the terms behind its assignment, identical to the values of pciSeq's check_cell and check_spot.
---

# Diagnostics

pciSeq saves, with its results, the terms from which each assignment was computed. The
diagnostics panels display them: **Ctrl+Click** on a cell shows why it was assigned its
class, and on a spot, why it was assigned to its cell. They are the viewer's counterpart of
pciSeq's [`check_cell`](https://acycliq.github.io/pciSeq_3d/api/reference#check-cell) and
[`check_spot`](https://acycliq.github.io/pciSeq_3d/api/reference#check-spot), read from the
same `diagnostics.db`, so the values agree exactly with those returned in Python.

The meaning of each term is explained on the pciSeq site, with a worked example for each:
[why a cell got its type](https://acycliq.github.io/pciSeq_3d/explaining-the-calls/why-a-cell-got-its-type)
and
[why a spot got its cell](https://acycliq.github.io/pciSeq_3d/explaining-the-calls/why-a-spot-got-its-cell).

::: info The diagnostics database
The diagnostics require `diagnostics/diagnostics.db` in the data folder, which the viewer
locates automatically. A database stored elsewhere can be selected with **Diagnostics,
Setup**. If Ctrl+Click has no effect, no database is connected; runs from pciSeq versions
earlier than `0.0.66` do not have one.
:::

## Cell diagnostics

The panel opens with the cell's assigned class and a choice of the class to compare it
against, by default the runner-up. **Compare** displays the two side by side.

<figure class="shot panel">
<img src="/img/cell-diagnostics.png" alt="The cell diagnostics panel: the genes that favour each of the two classes as diverging bars, and the tables under them">
<figcaption>Cell 14270, assigned to an oligodendrocyte class, compared with the runner-up: the genes that favour each class and the size of their contribution.</figcaption>
</figure>

The panel has two tabs:

- **Genes.** The genes with the largest contributions to each class, shown as bars either
  side of zero: the contribution of each gene to the log-likelihood of the assigned class
  minus its contribution to the comparison class. Below, a table of the cell's counts for
  each gene against the expression expected under each class, and a table of the
  contributions.
- **Posterior.** The three components of each class's score (the gene log-likelihood, the
  class prior and the spatial term) and the resulting class probabilities.

An assignment is borderline when the bars approximately cancel, or when the two
probabilities on the Posterior tab are close.

## Spot diagnostics

The panel shows the spot's gene and position, followed by every candidate cell the spot
was scored against, and the background:

- **Probabilities:** one per candidate cell and one for the background.
- **Scores:** one bar per candidate, decomposed into its terms: the Gaussian fit to the
  cell centre, the class expression of the gene, the cell scale, the cell-gene scale, the
  gene efficiency and the inside-cell term. A tick marks the total. The last bar is the
  background, whose score consists solely of the misread term. Higher scores are more
  favourable.
- **Table:** the same values in tabular form, with the sum and the probability for each
  row.

<figure class="shot panel">
<img src="/img/spot-diagnostics.png" alt="The spot diagnostics panel: the probability of each candidate cell and the background, and the score of each split into its terms">
<figcaption>A spot between two cells. The bars show which term determined the assignment.</figcaption>
</figure>

## The agent

When asked why a cell or a spot received its assignment, [the agent](./ai-agent) explains
the same terms in prose. It reads the same database and can open either panel on request.
