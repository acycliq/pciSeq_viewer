---
sidebar_position: 2
title: Preparing Your Data
description: Generate Arrow files and background tiles for the viewer using Python.
---

# Preparing Your Data

Before using the viewer you prepare your data in Python in two steps:

1. **Run pciSeq**, generates cell typing results (Arrow files).
2. **Create background tiles**, converts your microscopy image to viewable tiles (MBTiles).

:::info[These functions live in pciSeq, not the viewer]

`pciSeq.fit()` and `pciSeq.stage_image()` belong to the
[pciSeq Python package](https://github.com/acycliq/pciSeq). The viewer only
*reads* the output. For the full API of these functions, see the pciSeq docs.

:::

## Requirements

Install the pciSeq Python package:

```bash
pip install git+https://github.com/acycliq/pciSeq.git@dev_3d
```

Background image processing uses **pyvips**. The `pip install` above pulls in `pyvips[binary]`, which bundles the libvips binaries, so on most setups you don't need to install anything extra.

If pyvips can't find libvips on your machine (older setups, or a non-binary install), install it yourself:

```bash
# macOS
brew install vips

# Ubuntu / Debian
sudo apt install libvips
```

## Step 1: Run pciSeq

This performs cell typing and generates the data files the viewer needs.

```python
import pciSeq

spots = ...       # DataFrame: x, y, z_plane, gene_name
coo = ...         # list of sparse matrices (cell segmentation masks)
scRNAseq = ...    # single-cell reference data

pciSeq.fit(
    spots=spots,
    coo=coo,
    scRNAseq=scRNAseq,
    opts={
        'save_data': True,
        'output_path': '/path/to/my_dataset',
    },
)
```

This creates a results folder:

```
/path/to/my_dataset/
└── pciSeq/data/viewer_data/
    ├── arrow_spots/        # gene spot locations
    ├── arrow_cells/        # cell information
    └── arrow_boundaries/   # cell boundary polygons
```

## Step 2: Create Background Tiles

Convert your microscopy image (e.g. DAPI) into tiles the viewer can display.

```python
import pciSeq
import numpy as np

# (Z, H, W) for 3D data, or (H, W) for 2D
dapi_image = np.load('/path/to/dapi_image.npy')

pciSeq.stage_image(
    img=dapi_image,
    out_dir='/path/to/my_dataset/pciSeq/data/viewer_data',
    name='My Dataset',
    description='DAPI staining, mouse cortex',
)
```

This writes `output.mbtiles` into the target directory.

:::note[Requires pciSeq > 0.0.65]

`stage_image()` was added after `0.0.65`. If `out_dir` is omitted, the file is
written to the system temp directory (`/tmp` on Linux, `/var/folders/...` on macOS).

:::

## Final data structure

```
/path/to/my_dataset/
└── pciSeq/data/viewer_data/
    ├── output.mbtiles
    ├── arrow_spots/
    │   ├── manifest.json
    │   ├── gene_dict.json
    │   └── spots_shard_*.feather
    ├── arrow_cells/
    │   ├── manifest.json
    │   ├── class_dict.json
    │   └── cells_shard_*.feather
    ├── arrow_boundaries/
    │   ├── manifest.json
    │   └── boundaries_plane_*.feather
    └── diagnostics/
        └── diagnostics.db
```

## Complete example

```python
import pciSeq
import pandas as pd
import numpy as np
from scipy.sparse import coo_matrix

spots = pd.read_csv('spots.csv')        # x, y, z_plane, gene_name
masks = np.load('segmentation.npy')     # (Z, H, W) segmentation masks
coo = [coo_matrix(m) for m in masks]
scRNAseq = pd.read_csv('reference.csv')
dapi = np.load('dapi.npy')              # (Z, H, W) background image

output_folder = '/path/to/my_experiment'

# 1. Run pciSeq
pciSeq.fit(
    spots=spots, coo=coo, scRNAseq=scRNAseq,
    opts={'save_data': True, 'output_path': output_folder},
)

# 2. Create MBTiles
pciSeq.stage_image(
    img=dapi,
    out_dir=f'{output_folder}/pciSeq/data/viewer_data',
    name='WT Mouse',
    description='Mouse cortex, 102 z-planes',
)

print(f'Done! Open this folder in the viewer: {output_folder}/pciSeq/data/viewer_data')
```
