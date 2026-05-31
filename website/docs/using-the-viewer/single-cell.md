---
sidebar_position: 9
title: Single Cell Data
description: Compare the scRNA-seq reference against the model's implied counts.
---

# Single Cell Data

pciSeq types cells against a single-cell RNA-seq (scRNA-seq) reference. The
viewer can open that reference in its own window, alongside the counts the model
implies from the spatial data, so you can compare the two.

## Opening the view

In the menu bar choose **Single Cell Data → View…**. A separate window opens with
two tabs:

- **Reference (scRNA-seq)**, `sc_mean_expression`: the scRNA-seq atlas, i.e. the
  mean expression per gene per cell class.
- **Implied (spatial data)**, `mean_gene_reads_per_class`: what the model
  expects the gene reads per class to be, derived from your spatial data.

Both tabs show a grid of genes (rows) by cell classes (columns), with
**gene** and **class** filter boxes to narrow the view.

:::note[Requires diagnostics data]

Both tabs read from `diagnostics.db`. If it isn't loaded, the window reports
*"Diagnostics data not loaded"*. Connect one via **Diagnostics → Setup…** (see
[Diagnostics](./diagnostics)).

:::

:::note[Screenshot]

Capture the Single Cell Data window on the Reference tab with a gene filter
applied. Save as `static/img/single-cell.png`.

:::