---
sidebar_position: 2
title: Data Format Specification
description: The Arrow file layout the viewer reads, for generating data without the pciSeq Python package.
---

# Data Format Specification

The viewer reads its data from **Apache Arrow (Feather v2)** files written by the
pciSeq Python package. This page documents the exact layout each file must have.
All Feather files are written **uncompressed**.

## Coordinate units

All coordinates are stored in a single isotropic unit: image pixels on the xy
grid. This applies to `x`, `y`, `z` for spots and `X`, `Y`, `Z` for cells.

`z` and `Z` are pixel coordinates on the same scale as `x` and `y`. They are not
plane indices and not microns. Anisotropy between the lateral and axial
directions is not encoded in the coordinates; it is provided separately as the
voxel size entered in the viewer, for example `[0.28, 0.28, 0.7]` microns per
pixel for x, y, z.

The viewer maps a `z` coordinate to a plane as:

```
plane = floor(z * voxel_x / voxel_z)
```

For example, with voxel size `[0.28, 0.28, 0.7]` a `z` of `100` maps to plane
`floor(100 * 0.28 / 0.7) = 40`.

## Folder layout

```
viewer_data/
├── output.mbtiles            # background image (optional, see Loading Data)
├── arrow_spots/
│   ├── manifest.json
│   ├── gene_dict.json
│   └── spots_shard_*.feather
├── arrow_cells/
│   ├── manifest.json
│   └── cells_shard_*.feather
└── arrow_boundaries/
    ├── manifest.json
    └── boundaries_plane_*.feather
```

## manifest.json

Each `arrow_*` folder has a manifest listing its shards. The viewer reads the
shards in the listed order and concatenates them, so you can split a table into
as many shards as you like (pciSeq uses 200,000 rows per spot shard and 100,000
per cell shard, but that is a producer choice, not a requirement).

```json
{
  "format": "arrow-feather",
  "total_rows": 450000,
  "shards": [
    { "url": "spots_shard_000.feather", "rows": 200000 },
    { "url": "spots_shard_001.feather", "rows": 200000 },
    { "url": "spots_shard_002.feather", "rows": 50000 }
  ]
}
```

- `url` is the shard filename, relative to the manifest.
- `rows` is the row count of that single shard.
- `total_rows` is the sum of `rows` across all shards (here `200000 + 200000 + 50000 = 450000`). The last shard is usually smaller, since it holds the remainder.
- The boundaries manifest has two extra fields (see below).

## arrow_spots

One row per spot (gene read).

| Column | Type | Required | Meaning |
|---|---|---|---|
| `x` | float32 | yes | X coordinate |
| `y` | float32 | yes | Y coordinate |
| `z` | float32 | yes (3D) | Z coordinate |
| `plane_id` | uint16 | yes | Z-plane index the spot belongs to |
| `spot_id` | uint32 | yes | Unique spot id (used for picking and the Spot Inspector) |
| `gene_id` | uint32 | yes | Gene id, mapped to a name through `gene_dict.json` |
| `neighbour_array` | list&lt;int32&gt; | optional | Candidate cell ids, for the Spot Inspector |
| `neighbour_prob` | list&lt;float32&gt; | optional | Assignment probabilities, matching `neighbour_array` |
| `omp_score` | float32 | optional | Detection score, drives the **Score Filter** |
| `omp_intensity` | float32 | optional | Detection intensity, drives the **Intensity Filter** |

### gene_dict.json

Maps each `gene_id` to its gene name. Keys are the ids written as strings:

```json
{
  "0": "Aldoc",
  "1": "Bcl11b",
  "2": "Cadps2"
}
```

`gene_id` is pciSeq's 0-based index of the gene in the alphabetically sorted
gene panel (`np.unique` of the gene names), so the keys run `0` to `N-1` with no
gaps and the names come out in alphabetical order. Any other stable mapping works, as long as the spots' `gene_id` column and these
keys use the same ids.

## arrow_cells

One row per cell. Note the **uppercase** `X`, `Y`, `Z` for the centroid.

| Column | Type | Meaning |
|---|---|---|
| `cell_id` | int32 | The cell's original segmentation label |
| `X` | float32 | Centroid X |
| `Y` | float32 | Centroid Y |
| `Z` | float32 | Centroid Z |
| `class_name` | list&lt;string&gt; | Candidate cell-type names, ordered by probability |
| `prob` | list&lt;float32&gt; | Probabilities matching `class_name` |
| `gene_names` | list&lt;string&gt; | Genes detected in the cell |
| `gene_counts` | list&lt;float32&gt; | Counts matching `gene_names` |

:::note[No class_dict.json needed]

Cell-class names live directly in the `class_name` list column. A separate
`class_dict.json` is a legacy artefact and is not required, the current
converter does not write one.

:::

## arrow_boundaries

One Feather file **per plane**, named `boundaries_plane_XX.feather` (zero-padded
plane number). One row per polygon.

| Column | Type | Meaning |
|---|---|---|
| `x_list` | list&lt;float32&gt; | Polygon X coordinates |
| `y_list` | list&lt;float32&gt; | Polygon Y coordinates |
| `plane_id` | uint16 | Plane index for this polygon |
| `label` | int32 | The cell id (segmentation label) the polygon outlines |

:::warning[Every plane needs a shard, even empty ones]

There must be one shard per plane, with no gaps in the plane numbering. If a
plane has no polygons, you still write a `boundaries_plane_XX.feather` with the
same four-column schema and **zero rows**, and you still list it in the manifest
with `"rows": 0` (see `boundaries_plane_00.feather` in the example below). Do not
skip empty planes.

:::

The boundaries manifest adds `total_points` and a `plane` field per shard:

```json
{
  "format": "arrow-feather",
  "total_rows": 1850,
  "total_points": 41200,
  "shards": [
    { "url": "boundaries_plane_00.feather", "rows": 0, "plane": 0 },
    { "url": "boundaries_plane_01.feather", "rows": 800, "plane": 1 },
    { "url": "boundaries_plane_02.feather", "rows": 1050, "plane": 2 }
  ]
}
```

- `rows` is the number of polygons in that plane's shard; `plane` is its plane number.
- `total_rows` is the sum of `rows` across all shards (the total polygon count, here `0 + 800 + 1050 = 1850`).
- `total_points` is the total number of boundary coordinate points across all polygons. It is an aggregate over the whole dataset and is not broken out per shard.

## Background image (MBTiles)

The background is a SQLite **MBTiles** file (`output.mbtiles`) that extends the
standard format in two ways to handle a z-stack of microscopy images.

**1. A `plane_id` dimension.** Standard MBTiles holds a single 2D tile pyramid;
this file adds a `plane_id` column so each z-plane gets its own pyramid.

- `tiles`: `plane_id`, `zoom_level`, `tile_column`, `tile_row`, `tile_data`,
  unique on the first four. In de-duplicated files `tiles` is a view over a
  `map` table and an `images` table, with the same columns.
- `metadata`: name/value pairs. Standard keys (`format`, `minzoom`, `maxzoom`,
  `name`, `description`) plus custom ones: `planes` (comma-separated plane ids),
  `plane_count`, `width`, `height`, and `tint`. The viewer reads `width`,
  `height`, and `plane_count` from here; uses `name` as the channel label; and
  uses `tint` (a `#RRGGBB` hex) to colour the channel. A file with no `tint` key
  renders grayscale. (Voxel size is not read from the mbtiles; it comes from the
  welcome screen.)

When a dataset folder holds several `.mbtiles` files, each is a switchable
background **channel**. The viewer discovers them per folder, labels each from
its `name`, and tints each from its own `tint` - so N files give N independently
coloured channels you switch between (e.g. a green GCaMP channel or a grayscale
DAPI one), shown one at a time with a smooth cross-fade.

**2. Google (XYZ) tiling, not TMS.** The tiles are generated with libvips
`dzsave(layout='google')`, so they follow the Google / OpenStreetMap slippy-map
scheme: the tile origin is the **top-left** and `tile_row` increases downward.
This is the opposite of the standard MBTiles convention (TMS, origin at the
bottom), so a generic MBTiles viewer that assumes TMS would show each plane
flipped vertically. The pciSeq viewer requests a tile as `plane_id = plane`,
`zoom_level = z`, `tile_column = x`, `tile_row = y`, with no flip.

## How the pieces link up

- A spot's `gene_id` looks up its name and colour through `gene_dict.json`.
- A boundary's `label` matches a cell's `cell_id`, that is how a polygon is tied
  to its cell.
- `plane_id` ties spots and boundaries to a z-plane; the number of planes comes
  from the boundaries manifest.
