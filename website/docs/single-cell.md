---
title: Single cell data
description: The cell type definitions used to fit the run, alongside the counts the fitted model implies for the spatial data.
---

# Single cell data

pciSeq scores each cell against the cell type definitions: the mean expression of each
gene in each class, passed to `fit` as `scRNAseq`. **Single Cell Data, View** opens them in
a separate window, alongside the mean counts per class observed in the spatial data, so
that the two can be compared gene by gene.

The window has two tabs, each a gene-by-class grid with a filter for genes and classes:

- **Reference:** the definitions as supplied, the mean expression per gene per class
  (`sc_mean_expression` in `diagnostics.db`).
- **Implied:** the mean count of each gene in each class in the spatial data, averaged
  over the cells and weighted by their class probabilities, pciSeq's
  [`mean_gene_reads_per_class`](https://acycliq.github.io/pciSeq_3d/api/reference#cells-mean-gene-reads-per-class).
  These are observed soft counts, not model expectations: no scale factor or gene
  efficiency is applied to them.

Both tabs read `diagnostics.db`. For a run without it, the window reports *Diagnostics data
not loaded*; a database stored elsewhere can be connected with **Diagnostics, Setup**.
