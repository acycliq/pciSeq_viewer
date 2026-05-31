---
sidebar_position: 1
title: Architecture
description: How the pciSeq Viewer codebase is organised.
---

# Architecture

A high-level map of the codebase for contributors.

:::note[Scaffold]

Fill in the specifics, this outline is seeded from the repo's top-level layout.

:::

## Stack

- **Electron** desktop shell (main + renderer processes), `electron/`
- **Renderer / UI**, `src/`, `index.html`, `styles.css`
- **Rendering**, deck.gl / voxel layers, `voxel-viewer/`
- **Data loading**, Arrow/Feather ingestion, `arrow-loader/`
- **Python helpers**, `python_converters/`, `generate_arrow_data.py`
- **Config**, `config/`, `config.js`
- **Build**, `build/`, `package.json`

## Process model

:::info[TODO]

TODO: describe the Electron main vs renderer split, IPC, and how a dataset folder flows from "File > Open" through arrow-loader into the deck.gl layers.

:::

## Data flow

```
File > Open Dataset
  └─ arrow-loader reads arrow_spots / arrow_cells / arrow_boundaries
       └─ voxel-viewer renders deck.gl layers over the MBTiles background
```
