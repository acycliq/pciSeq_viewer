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

<script setup>
const demos = [
  {
    key: 'map',
    title: 'Explore',
    blurb: 'every spot, every cell, plane by plane',
    still: '/img/map_still.png',
    gif: 'https://github.com/user-attachments/assets/79236976-b24c-4e5c-9b93-1577d7ffe7b6',
    alt: 'The section, its classes and genes, plane by plane, one cell',
  },
  {
    key: '3d',
    title: 'See it in 3D',
    blurb: 'a region as voxels, a cell and its spots inside',
    still: '/img/3d_still.png',
    gif: 'https://github.com/user-attachments/assets/507606e5-d075-4ff4-a3b3-633433cf2564',
    alt: 'A box drawn round two cells and the region built in 3D',
  },
  {
    key: 'chat',
    title: 'Ask the run',
    blurb: 'an agent with tools over the results',
    still: '/img/chat_still.png',
    gif: 'https://github.com/user-attachments/assets/76618be3-c5ed-4403-8c4d-3edf0a45b97f',
    alt: 'The chat panel answering three questions about the run',
  },
]
</script>

# pciSeq Viewer

A desktop application that opens the output of a [pciSeq](https://acycliq.github.io/pciSeq_3d/)
run and draws it over the tissue image: every spot coloured by gene, every cell coloured
by the class it was assigned to, plane by plane through the z-stack. Hover a cell for
its gene counts and class probabilities, or ask the agent why the cell got its class.

<DemoSwap :items="demos" />

<div class="doors">
<a href="./docs/installation"><b>Install</b><span>Installers for Windows, macOS and Linux, or run it from source.</span></a>
<a href="./docs/loading-data"><b>Load the data</b><span>What a run writes, how the background image is made, and how the viewer finds them.</span></a>
<a href="./docs/the-map"><b>Start exploring</b><span>The window, the planes, the drawer, and what a click on a cell opens.</span></a>
</div>

## Input

A run of `pciSeq.fit` writes a `viewer_data` folder: the spots, the cells and the cell
boundaries as Arrow files, and `diagnostics.db`, the terms behind every call. The
background image, tiled by `stage_image`, sits next to them. Point the viewer at the
folder and it picks up the rest. See [Loading the data](./docs/loading-data).

The viewer is a separate project from pciSeq itself. The method, its settings and the
functions that produce the files are documented on the
[pciSeq site](https://acycliq.github.io/pciSeq_3d/).
