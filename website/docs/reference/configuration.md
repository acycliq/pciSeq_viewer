---
sidebar_position: 1
title: Configuration Reference
description: Every tunable setting in the viewer and what it controls.
---

# Configuration Reference

The viewer's settings live in three files, all loaded by `index.html` before the
app starts:

- **`config.js`**, data paths and the metadata-loading machinery. You normally
  don't edit this.
- **`config/advanced.js`**, the tunable knobs (performance, startup display,
  visualization). This is the file to change.
- **`config/constants.js`**, derived values built from `advanced.js` plus a few
  fixed constants. Do not edit this; change `advanced.js` instead.

These are source-level settings. Edit `advanced.js`, then restart the app (or
rebuild the installer) for the change to take effect.

## config/advanced.js

### performance

| Setting | Default | What it controls |
|---|---|---|
| `preloadRadius` | `3` | How many planes ahead and behind the current one are preloaded, so moving through the z-stack feels instant. |
| `maxTileCache` | `1000` | Maximum number of background tiles kept in memory. Once exceeded, the oldest are evicted. |
| `showPerformanceStats` | `true` | When `true`, prints timing logs to the developer console. |

### display (startup defaults)

These set the initial state when a dataset opens. Each can then be toggled in
the UI.

| Setting | Default | What it controls |
|---|---|---|
| `showBackgroundImages` | `true` | Background tiles visible at startup (the "Dapi" layer toggle). |
| `showCellBoundaries` | `true` | Cell polygons visible at startup (the "Cells" layer toggle). |
| `showGeneMarkers` | `true` | Gene spots visible at startup. |
| `geneMarkerSize` | `1.0` | Starting value of the **Size** slider. |
| `polygonOpacity` | `0.4` | Starting polygon fill opacity (`0.0` to `1.0`). |

### visualization

| Setting | Default | What it controls |
|---|---|---|
| `geneBaseSize` | `20` | Base spot size in pixels at the current plane. A spot's drawn size is `geneBaseSize / sqrt(1 + |Δplane|)`, and the low-zoom dot uses a radius scale of `geneBaseSize / 10`. This is the main knob for how big spots are. |
| `tileSize` | `256` | Tile size for the coordinate system. In practice this is fixed at `256`, because `256` is also hard-coded in several places (the tile URL template, the initial view, the image-dimension defaults). Changing it here alone will desync those, so treat it as fixed. |

## Fixed constants (config/constants.js)

You do not edit these, but they are useful to know. They are not exposed in
`advanced.js`.

| Constant | Value | Meaning |
|---|---|---|
| `minZoom` / `maxZoom` | `0` / `8` | The zoom range. These are deck.gl zoom levels (a unitless log2 scale), not pixels. Set in `appInitializer.js` and `tileLayerCreator.js`. |
| `INITIAL_VIEW_STATE.zoom` | `2.0` | The zoom level the map opens at. |
| `SPOT_PICKABLE_MIN_ZOOM` | `7` | Below this zoom, spots render as a fast non-pickable dot layer; at or above it they switch to per-gene glyph icons. See [How spots are drawn](../using-the-viewer/genes-and-cells#how-spots-are-drawn). |
| `IMG_DIMENSIONS` fallback | `6411 x 4412` | Only used if image width/height are missing from both the MBTiles and user input. |

## Data paths (config.js)

These point the viewer at the files inside the open dataset. They use two custom
Electron protocols that resolve to the selected dataset folder:

| Path | Default |
|---|---|
| `backgroundTiles` | `mbtiles://tiles/{plane}/{z}/{y}/{x}.jpg` |
| `arrowSpotsManifest` | `app://arrow_spots/manifest.json` |
| `arrowCellsManifest` | `app://arrow_cells/manifest.json` |
| `arrowBoundariesManifest` | `app://arrow_boundaries/manifest.json` |
| `arrowSpotsGeneDict` | `app://arrow_spots/gene_dict.json` |

Image width, height, and plane count come from the MBTiles file (or manual
entry), and voxel size is entered on the welcome screen. None of those are set
here. See [Loading Data](../loading-data).

## Defined but not currently used

For honesty: these settings exist in `advanced.js` (or the constants derived
from it) but nothing reads them, so changing them has no effect.

- `performance.sliderDebounce`
- `performance.loadingTimeout`
- `visualization.geneMinScale`, `visualization.geneMaxScale`,
  `visualization.geneScaleStep`. The Size slider's range (`0.5` to `3.0`, step
  `0.1`) is hard-coded in `index.html`, so to change it you edit the slider
  there, not these values.
