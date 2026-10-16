---
title: Diagnostics
description: Ctrl-click a cell or a spot and a panel opens with the terms behind its call, the same numbers as pciSeq's check_cell and check_spot.
---

# Diagnostics

pciSeq saves, with its results, the terms from which every assignment was computed.
The diagnostics panels show them: **Ctrl+Click** a cell for why it got its class, **Ctrl+Click**
a spot for why it went to its cell. They are the viewer's version of pciSeq's
[`check_cell`](https://acycliq.github.io/pciSeq_3d/api/reference#check-cell) and
[`check_spot`](https://acycliq.github.io/pciSeq_3d/api/reference#check-spot), read from
the same `diagnostics.db`, so the numbers agree with the Python ones to the digit.

What the terms mean is on the pciSeq site, with a worked example of each:
[how a cell's call was made](https://acycliq.github.io/pciSeq_3d/explaining-the-calls/why-a-cell-got-its-type)
and
[how a spot's call was made](https://acycliq.github.io/pciSeq_3d/explaining-the-calls/why-a-spot-got-its-cell).

::: info The diagnostics database
The diagnostics need `diagnostics/diagnostics.db` in the data folder, which the viewer
finds on its own. A database kept elsewhere can be pointed to with **Diagnostics,
Setup** in the menu. If Ctrl+Click does nothing, the database is not connected; a run
from pciSeq older than `0.0.66` has none.
:::

## Cell diagnostics

The panel opens with the cell's assigned class and asks which class to compare it
against, the runner up by default. **Compare** then shows the two side by side.

<figure class="shot panel">
<img src="/img/cell-diagnostics.png" alt="The cell diagnostics panel: the genes that favour each of the two classes as diverging bars, and the tables under them">
<figcaption>Cell 14270, assigned oligodendrocyte, against its runner up. The genes that argued for each class, and by how much.</figcaption>
</figure>

Two tabs:

- **Genes.** The genes that pushed hardest for each class, as bars either side of
  zero: the contribution of each gene to the log-likelihood of the assigned class minus
  its contribution to the other. Under them, a table of what the cell holds of each gene
  against what each class expects, and a table of the contributions.
- **Posterior.** The three parts of each class's score, the gene log-likelihood, the
  class prior and the spatial term, and the probability of each class that results.

A borderline call is one where the bars nearly cancel, or where the two probabilities on
the Posterior tab are close.

## Spot diagnostics

The panel shows the spot's gene and position, then every cell the spot was scored
against plus the background:

- **The probabilities**, one per candidate cell and one for the background.
- **The scores**, one bar per candidate, split into its terms: the Gaussian fit to the
  cell's centre, the class expression of the gene, the cell scale, the cell-gene scale,
  the gene efficiency and the inside-cell term. A tick marks the total. The last bar is
  the background, whose whole score is the misread term. Higher is better.
- **The table**, the same numbers as a table, with the sum and the probability of each
  row.

<figure class="shot panel">
<img src="/img/spot-diagnostics.png" alt="The spot diagnostics panel: the probability of each candidate cell and the background, and the score of each split into its terms">
<figcaption>A spot between two cells. The bars show which term tipped it.</figcaption>
</figure>

## The agent

The same terms, explained in prose rather than shown, are what
[the agent](./ai-agent) gives when asked why a cell or a spot got its call.
It reads the same database and can open either panel on request.
