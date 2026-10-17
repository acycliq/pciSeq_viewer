---
title: Single cell data
description: The cell type definitions used to fit the run, alongside the counts the fitted model implies for the spatial data.
---

# Single cell data

pciSeq scores each cell against the cell type definitions: the mean expression of each
gene in each class, passed to `fit` as `scRNAseq`. **Single Cell Data, View** opens them in
a separate window, alongside the counts implied by the fitted model, so that the two can be
compared gene by gene.

The window has two tabs, each a gene-by-class grid with a filter for genes and classes:

- **Reference:** the definitions as supplied, the mean expression per gene per class
  (`sc_mean_expression` in `diagnostics.db`).
- **Implied:** the mean reads per gene per class expected by the fitted model in the
  spatial data, pciSeq's
  [`mean_gene_reads_per_class`](https://acycliq.github.io/pciSeq_3d/api/reference#cells-mean-gene-reads-per-class).
  The difference from the reference reflects the adjustment made by the scale factors and
  the gene efficiencies.

Both tabs read `diagnostics.db`. For a run without it, the window reports *Diagnostics data
not loaded*; a database stored elsewhere can be connected with **Diagnostics, Setup**.
