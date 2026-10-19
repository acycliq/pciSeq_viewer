---
title: Data format
description: The files read by the viewer, column by column, for producing them without the pciSeq Python package.
---

# Data format

The viewer reads its data from **Apache Arrow (Feather v2)** files written by the
pciSeq Python package. This page specifies the required layout of each file. All
Feather files are written **uncompressed**.

## Coordinate units

All coordinates are stored in a single isotropic unit: image pixels on the xy
grid. This applies to `x`, `y`, `z` for spots and `X`, `Y`, `Z` for cells.

`z` and `Z` are pixel coordinates on the same scale as `x` and `y`. They are not
plane indices and not microns. Anisotropy between the lateral and axial
directions is not encoded in the coordinates; it is provided separately by the voxel
size, recorded in `diagnostics.db` or entered by the user, for example
`[0.28, 0.28, 0.7]` microns per pixel for x, y, z.

The viewer maps a `z` coordinate to a plane as follows:

```
plane = floor(z * voxel_x / voxel_z)
```

For example, with voxel size `[0.28, 0.28, 0.7]` a `z` of `100` maps to plane
`floor(100 * 0.28 / 0.7) = 40`.

## Folder layout

```
viewer_data/
├── dapi.mbtiles              # background image, named after its channel (optional)
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

Each `arrow_*` folder contains a manifest listing its shards. The viewer reads the shards
in the listed order and concatenates them, so a table may be split into any number of
shards (pciSeq uses 200,000 rows per spot shard and 100,000 per cell shard; this is a
choice of the producer, not a requirement).

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
- `total_rows` is the sum of `rows` across all shards (here `200000 + 200000 + 50000 = 450000`). The last shard is usually smaller, as it holds the remainder.
- The boundaries manifest has two additional fields (see below).

## arrow_spots

One row per spot (gene read).

| Column | Type | Required | Description |
|---|---|---|---|
| `x` | float32 | yes | X coordinate |
| `y` | float32 | yes | Y coordinate |
| `z` | float32 | yes (3D) | Z coordinate |
| `plane_id` | uint16 | yes | Z-plane index the spot belongs to |
| `spot_id` | uint32 | yes | Unique spot id (used for picking and the spot diagnostics) |
| `gene_id` | uint32 | yes | Gene id, mapped to a name through `gene_dict.json` |
| `neighbour_array` | list&lt;int32&gt; | optional | Candidate cell ids, for the spot diagnostics |
| `neighbour_prob` | list&lt;float32&gt; | optional | Assignment probabilities, matching `neighbour_array` |
| `omp_score` | float32 | optional | Detection score, used by the **Score Filter** |
| `omp_intensity` | float32 | optional | Detection intensity, used by the **Intensity Filter** |
| `is_hard_misread` | uint8 | optional | 1 if the background is the spot's most probable parent; derived from `neighbour_prob` when absent |

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
gene panel (`np.unique` of the gene names), so the keys run from `0` to `N-1` without
gaps and the names are in alphabetical order. Any other stable mapping is valid, provided
that the spots' `gene_id` column and these keys use the same ids.

## arrow_cells

One row per cell. The fitted cell centroid columns `X`, `Y`, `Z` are **uppercase**.

| Column | Type | Description |
|---|---|---|
| `cell_id` | int32 | The cell's original segmentation label |
| `X` | float32 | Fitted centroid X |
| `Y` | float32 | Fitted centroid Y |
| `Z` | float32 | Fitted centroid Z |
| `class_name` | list&lt;string&gt; | Candidate class names, ordered by probability |
| `prob` | list&lt;float32&gt; | Probabilities matching `class_name` |
| `gene_names` | list&lt;string&gt; | Genes detected in the cell |
| `gene_counts` | list&lt;float32&gt; | Counts matching `gene_names` |

::: info No class_dict.json needed

Class names are stored directly in the `class_name` list column. A separate
`class_dict.json` is a legacy artefact and is not required; pciSeq does not write one.

:::

## arrow_boundaries

One Feather file **per plane**, named `boundaries_plane_XX.feather` (zero-padded
plane number). One row per polygon.

| Column | Type | Description |
|---|---|---|
| `x_list` | list&lt;float32&gt; | Polygon X coordinates |
| `y_list` | list&lt;float32&gt; | Polygon Y coordinates |
| `plane_id` | uint16 | Plane index for this polygon |
| `label` | int32 | The cell id (segmentation label) the polygon outlines |

::: warning Every plane needs a shard, even empty ones

There must be one shard per plane, with no gaps in the plane numbering. If a
plane has no polygons, a `boundaries_plane_XX.feather` is still written with the
same four-column schema and **zero rows**, and still listed in the manifest
with `"rows": 0` (see `boundaries_plane_00.feather` in the example below). Empty planes
must not be omitted.

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

The background is a SQLite **MBTiles** file, named after its channel by `stage_image`
(`dapi.mbtiles`; `output.mbtiles` when no name is given), which extends the standard
format in two respects to accommodate a z-stack of microscopy images.

**1. A `plane_id` dimension.** Standard MBTiles holds a single 2D tile pyramid; this
file adds a `plane_id` column, so that each z-plane has its own pyramid.

- `tiles`: `plane_id`, `zoom_level`, `tile_column`, `tile_row`, `tile_data`,
  unique on the first four. In de-duplicated files `tiles` is a view over a
  `map` table and an `images` table, with the same columns.
- `metadata`: name/value pairs. The standard keys (`format`, `minzoom`, `maxzoom`,
  `name`, `description`) and the custom keys `planes` (comma-separated plane ids),
  `plane_count`, `width`, `height`, `tint`, `created` and `tile_count`. The viewer reads
  `width`, `height` and `plane_count` from this table, uses `name` as the channel label,
  and uses `tint` (a `#RRGGBB` hexadecimal value) to colour the channel. A file without a
  `tint` key is rendered in greyscale. (The voxel size is not read from the MBTiles file;
  it is read from `diagnostics.db` or entered by the user.)

When a dataset folder contains several `.mbtiles` files, each is a selectable background
**channel**. The viewer detects them in the folder, labels each by its `name` and tints
each by its own `tint`, so that N files yield N independently coloured channels (for
example a green GCaMP channel alongside a greyscale DAPI channel), displayed one at a time
with a cross-fade.

**2. Google (XYZ) tiling, not TMS.** The tiles are generated with libvips
`dzsave(layout='google')` and therefore follow the Google / OpenStreetMap slippy-map
scheme: the tile origin is at the **top left** and `tile_row` increases downwards. This is
the reverse of the standard MBTiles convention (TMS, origin at the bottom), so a generic
MBTiles viewer that assumes TMS would display each plane flipped vertically. pciSeq Viewer
requests a tile as `plane_id = plane`, `zoom_level = z`, `tile_column = x`,
`tile_row = y`, without flipping.

## Cross references

- A spot's `gene_id` resolves to its name through `gene_dict.json`; the name determines its
  colour and glyph.
- A boundary's `label` matches a cell's `cell_id`, which links each polygon to its cell.
- `plane_id` links spots and boundaries to a z-plane; the number of planes is taken from
  the `.mbtiles` file, or entered by the user.
