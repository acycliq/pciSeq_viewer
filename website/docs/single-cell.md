---
title: Single cell data
description: The cell type definitions the run was fitted against, next to the counts the model implies from the spatial data.
---

# Single cell data

pciSeq scores every cell against the cell type definitions, the mean expression of each
gene in each class, given to `fit` as `scRNAseq`. **Single Cell Data, View** in the
menu opens them in a window of their own, next to what the fitted model implies the
counts should be, so the two can be compared gene by gene.

Two tabs, each a grid of genes by classes with a filter box for either:

- **Reference**, the definitions as they went in: the mean expression per gene per
  class, `sc_mean_expression` in `diagnostics.db`.
- **Implied**, the mean reads per gene per class the model expects in the spatial data
  after fitting, pciSeq's
  [`mean_gene_reads_per_class`](https://acycliq.github.io/pciSeq_3d/api/reference#cells-mean-gene-reads-per-class).
  The difference from the reference is what the scale factors and the gene
  efficiencies absorbed.

Both read `diagnostics.db`. A run without it reports *Diagnostics data not loaded*; a
database kept elsewhere can be connected with **Diagnostics, Setup**.
