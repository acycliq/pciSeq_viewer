---
title: Configuration
description: The settings in the viewer's source code and their effect.
---

# Configuration

The viewer's settings are defined in three files, all loaded by `index.html` before the
application starts:

- **`config.js`:** data paths and the metadata-loading logic; rarely edited.
- **`config/advanced.js`:** the adjustable settings (performance, startup display,
  visualisation). Changes should be made in this file.
- **`config/constants.js`:** values derived from `advanced.js`, and a few fixed constants.
  This file should not be edited; change `advanced.js` instead.

These are source-level settings. After editing `advanced.js`, restart the application (or
rebuild the installer) for the change to take effect.

## config/advanced.js

### performance

| Setting | Default | Description |
|---|---|---|
| `preloadRadius` | `3` | Number of planes before and after the current one that are preloaded, so that moving through the z-stack is immediate. |
| `maxTileCache` | `1000` | Maximum number of background tiles held in memory. When exceeded, the oldest tiles are evicted. |
| `showPerformanceStats` | `true` | When `true`, writes timing logs to the developer console. |
| `progressiveSpots` | `true` | Draws the spots shard by shard as they load, nearest plane first, rather than after all have loaded. |

### display (startup defaults)

These define the initial state when a dataset is opened. Each can subsequently be toggled
in the interface.

| Setting | Default | Description |
|---|---|---|
| `showBackgroundImages` | `true` | Background tiles visible at startup (the "Dapi" layer toggle). |
| `showCellBoundaries` | `true` | Cell polygons visible at startup (the "Cells" layer toggle). |
| `showGeneMarkers` | `true` | Gene spots visible at startup. |
| `geneMarkerSize` | `1.0` | Initial value of the **Size** slider. |
| `polygonOpacity` | `0.4` | Initial polygon fill opacity (`0.0` to `1.0`). |

### visualization

| Setting | Default | Description |
|---|---|---|
| `geneBaseSize` | `20` | Base spot size in pixels on the current plane. The rendered size of a spot is `geneBaseSize / sqrt(1 + |Δplane|)`, and the low-zoom dot layer uses a radius scale of `geneBaseSize / 10`. This is the principal setting for spot size. |
| `tileSize` | `256` | Tile size of the coordinate system. In practice it is fixed at `256`, because the same value is hard-coded elsewhere (the tile URL template, the initial view, the image-dimension defaults). Changing it here alone would make these inconsistent; it should be treated as fixed. |

## Fixed constants (config/constants.js)

These are not intended to be edited and are not exposed in `advanced.js`; they are listed
for reference.

| Constant | Value | Description |
|---|---|---|
| `minZoom` / `maxZoom` | `0` / `8` | The zoom range, in deck.gl zoom levels (a unitless log2 scale), not pixels. Set in `appInitializer.js` and `tileLayerCreator.js`. |
| `INITIAL_VIEW_STATE.zoom` | `2.0` | The initial zoom level of the map. |
| `SPOT_PICKABLE_MIN_ZOOM` | `7` | Below this zoom level, spots are rendered as a non-pickable dot layer; at or above it, as per-gene glyphs. See [Spots and cells](../the-map#spots-and-cells). |
| `IMG_DIMENSIONS` fallback | `6411 x 4412` | Used only if the image width and height are available neither from the MBTiles file nor from user input. |

## Data paths (config.js)

These locate the files within the open dataset. They use two custom Electron protocols
that resolve to the selected dataset folder:

| Path | Default |
|---|---|
| `backgroundTiles` | `mbtiles://tiles/{plane}/{z}/{y}/{x}.jpg` |
| `arrowSpotsManifest` | `app://arrow_spots/manifest.json` |
| `arrowCellsManifest` | `app://arrow_cells/manifest.json` |
| `arrowBoundariesManifest` | `app://arrow_boundaries/manifest.json` |
| `arrowSpotsGeneDict` | `app://arrow_spots/gene_dict.json` |

The image width, height and plane count are read from the MBTiles file (or entered
manually), and the voxel size from `diagnostics.db`; none of these are set here. See
[Loading the data](../loading-data).

## Unused settings

The following settings are defined in `advanced.js` (or in the constants derived from it)
but are not read anywhere, so changing them has no effect.

- `performance.sliderDebounce`
- `performance.loadingTimeout`
- `visualization.geneMinScale`, `visualization.geneMaxScale`,
  `visualization.geneScaleStep`. The range of the Size slider (`0.5` to `3.0`, step
  `0.1`) is hard-coded in `index.html`; changing it requires editing the slider there.
