---
title: Architecture
description: How the pciSeq Viewer codebase is organised.
---

# Architecture

A high-level map of the codebase for contributors.

## Stack

- **Electron**, the desktop shell. The **Main process** (`electron/main.js`) handles file system access, menu bars, and window management. The **Renderer process** (`src/app.js`) handles the UI and map.
- **deck.gl**, high-performance WebGL rendering for the map. Layers are defined in `src/layers/`.
- **Apache Arrow**, the primary data format. We use `arrow-loader/` to ingest large datasets efficiently.
- **D3.js**, used for charts (gene distributions, class probabilities) and legends.
- **Python**, conversion scripts under `python_converters/` for preparing raw TSV data into the Arrow/MBTiles format.

## Process model

When you open a dataset:
1. **Selection:** The Main process prompts for a folder and sends the path to the Renderer.
2. **Metadata:** `src/data/dataLoaders.js` reads the Arrow manifests to determine the plane count, gene list, and cell classes.
3. **Ingestion:** Spots, cells, and boundaries are loaded via `arrow-loader/`. Spots and cells are loaded once and cached in memory; boundaries are loaded per-plane as you navigate.
4. **Indexing:** `src/data/cellIndexes.js` builds spatial and cross-reference indexes (e.g., which spots belong to which cell) for fast hover interactions.
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

Spots are drawn one of two ways depending on zoom, with the switch decided in
`handleViewStateChange` (`src/app.js`) against the `SPOT_PICKABLE_MIN_ZOOM`
constant (`7`):

- **Below zoom 7:** a single binary `ScatterplotLayer` (the "PointCloud") draws
  every spot as a coloured dot. There is no culling here; one layer handles
  millions of points.
- **Zoom 7 and above:** `IconLayer`s draw the spots as per-gene glyphs.

deck.gl's `onViewStateChange` fires continuously during pan and zoom, and the
handler treats two cases differently:

- **Crossing the threshold** (dots to glyphs, or back): it rebuilds the layers
  immediately, even in the middle of a gesture, so the switch is instant.
- **Already in glyph mode and panning:** it does not rebuild every frame. It
  rebuilds on **pan end** (the drag is released), to re-crop the glyphs to the
  new viewport.

**Viewport culling (glyph mode only).** `getCurrentViewportTileBounds()`
unprojects the screen corners to world coordinates, and `createGeneLayers`
(`src/layers/spotLayerCreator.js`) keeps only the spots inside those bounds
before building the `IconLayer`. Off-screen spots are dropped. If the viewport
bounds are unavailable for a frame, it falls back to the `ScatterplotLayer`. The
PointCloud path never culls, since it is cheap enough to draw everything.
