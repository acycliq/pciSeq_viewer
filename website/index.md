---
layout: doc
title: pciSeq Viewer
sidebar: false
aside: false
outline: false
prev: false
next: false
editLink: false
lastUpdated: false
pageClass: landing
---

# pciSeq Viewer

Interactive desktop application for exploring 3D spatial transcriptomics results from pciSeq

[Read the docs](/docs/) &nbsp;&nbsp;&nbsp; [Prepare your data](/docs/preparing-data)

![pciSeq Viewer demo](/img/demo.gif)

## About

**Explore your results in space.** Pan and zoom a large tissue image through its z-stack, with every gene spot and cell boundary drawn on top: spots coloured per gene, cells coloured by predicted type, with show/hide filters for both.

**Inspect any cell or spot.** Hover a cell for its gene counts, class probabilities, and a quick chart; with diagnostics data connected, see why a cell or spot was assigned the way it was.

**Drop into 3D.** Select a region and render it as a true 3D volume instead of a stack of planes.

**Built for scale, runs locally.** GPU-rendered with deck.gl so large datasets (millions of spots) stay interactive: a desktop app for Windows, macOS and Linux, with your data staying on your machine.

## Loading data from pciSeq

The viewer reads the output of the pciSeq Python package directly. Run your analysis, save the results, then open the folder in the viewer.

```python
import pciSeq

# 1. Run cell typing and save the results to disk
pciSeq.fit(spots=spots, coo=masks, scRNAseq=sc, opts={
    'save_data': True,
    'output_path': './my_dataset'
})

# 2. Open pciSeq Viewer and load ./my_dataset to explore in 3D.
```
