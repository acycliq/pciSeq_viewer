---
title: Architecture
description: How the pciSeq Viewer codebase is organised.
---

# Architecture

This page describes the organisation of the code, for contributors.

## Stack

- **Electron:** the desktop shell. The **main process** (`electron/main.js`) handles file system access, menus and window management; the **renderer process** (`src/app.js`) handles the interface and the map.
- **deck.gl:** WebGL rendering of the map. Layers are defined in `src/layers/`.
- **Apache Arrow:** the data format. `arrow-loader/` reads the large files.
- **D3.js:** charts (gene distributions, class probabilities) and legends.
- **The agent** is implemented in the main process: `electron/chat.js` handles a conversation turn with the model, `electron/tools.js` defines the tools available to it and executes them against `diagnostics.db` through `electron/run.js`, and `electron/mcp-server.js` exposes the same tools to external assistants over HTTP on localhost.
- **Python**, on the pciSeq side: `pciSeq.fit` writes the Arrow files read by the viewer, and `stage_image` produces the MBTiles background.

## Process model

When a dataset is opened:

1. **Selection:** The Main process prompts for a folder, stores the path and reloads the Renderer.
2. **Metadata:** `src/data/dataLoaders.js` reads the Arrow manifests to determine the gene list and cell classes; the plane count comes from the `.mbtiles` file or user input.
3. **Ingestion:** Spots, cells, and boundaries are loaded via `arrow-loader/`. Spots and cells are loaded once and cached in memory; boundaries are loaded per plane, as the planes are visited.
4. **Indexing:** `src/data/cellIndexes.js` builds spatial and cross-reference indexes (which spots belong to which cell, for example) for fast hover interactions.
5. **Rendering:** `src/layers/layerBuilder.js` constructs the deck.gl layer stack for the current plane and zoom level.

## Data flow

```text
File > Open Dataset
  └─ Main Process (electron/main.js) -> stores path, opens MBTiles
       └─ Renderer Process (src/app.js) -> initializes deck.gl
            └─ arrow-loader -> reads spots, cells, and boundaries
                 └─ deck.gl -> renders layers (tiles, polygons, icons)
```

## Spot rendering and level of detail

Spots are drawn in one of two ways depending on the zoom level; the switch is made in
`handleViewStateChange` (`src/app.js`) against the `SPOT_PICKABLE_MIN_ZOOM` constant
(`7`). See [Spots and cells](../the-map#spots-and-cells).

- **Below zoom 7:** a single binary `ScatterplotLayer` (the "PointCloud") draws every
  spot as a coloured dot. No culling is applied; a single layer handles millions of
  points.
- **Zoom 7 and above:** a single `IconLayer` draws the spots in view as per-gene glyphs.

deck.gl's `onViewStateChange` fires continuously during panning and zooming, and the
handler distinguishes two cases:

- **Crossing the threshold** (from dots to glyphs, or the reverse): the layers are
  rebuilt immediately, even during a gesture, so that the switch is instantaneous.
- **Panning in glyph mode:** the layers are not rebuilt on every frame, but on **pan
  end** (when the drag is released), to crop the glyphs to the new viewport.

**Viewport culling (glyph mode only).** `getCurrentViewportTileBounds()`
unprojects the screen corners to world coordinates, and `createGeneLayers`
(`src/layers/spotLayerCreator.js`) keeps only the spots inside those bounds
before building the `IconLayer`; off-screen spots are discarded. If the viewport bounds
are unavailable for a frame, the `ScatterplotLayer` is used instead. The PointCloud path
does not cull, as drawing all spots is inexpensive.
