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

pciSeq Viewer shows every call of a [pciSeq](https://acycliq.github.io/pciSeq_3d/) run on
the tissue, plane by plane, and explains why each cell got its class.

<DemoSwap :items="demos" />

## First steps

1. **[Install it](./docs/installation).** Installers for Windows, macOS and Linux, or run
   it from source.
2. **[Open a run](./docs/loading-data).** `pciSeq.fit` with `save_data` on writes a
   `viewer_data` folder: the spots, the cells and their outlines as Arrow files, and
   `diagnostics.db`, the terms behind every call. The background image, tiled by
   `stage_image`, sits next to them.
3. **[Read the map](./docs/the-map).** The window, the planes, the drawer, and what a
   click on a cell opens.
4. **[Ask about a call](./docs/diagnostics).** Ctrl+Click a cell or a spot for the terms
   behind its call, or [ask the agent](./docs/ai-agent) in plain words.

The viewer is a separate project from pciSeq itself. The method, its settings and the
functions that write the files are documented on the
[pciSeq site](https://acycliq.github.io/pciSeq_3d/).
