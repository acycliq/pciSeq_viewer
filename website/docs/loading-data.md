---
title: Loading the data
description: The files a pciSeq run writes for the viewer, how the background image is tiled, and how the viewer opens the data folder.
---

# Loading the data

The viewer reads a single folder, `viewer_data`, written by `pciSeq.fit` when `save_data`
is enabled (the default). It is located under the run's `output_path`:

```
<output_path>/pciSeq/data/viewer_data/
├── arrow_spots/        # all spots: gene, position, candidate cells
├── arrow_cells/        # all cells: fitted centroid, classes, counts
├── arrow_boundaries/   # cell outlines, one file per plane
├── diagnostics/
│   └── diagnostics.db  # the terms behind every assignment, settings
└── dapi.mbtiles        # background image, written by stage_image
```

The Arrow folders are sufficient to draw the map. `diagnostics.db` is read by the
[diagnostics](./diagnostics) and the [agent](./ai-agent), and records the voxel size. The
`.mbtiles` file holds the background image; without it, the spots and cells are drawn on
an empty background. [Data format](./reference/data-format) specifies each file.

The functions that write these files are part of pciSeq, not of the viewer:
[`fit`](https://acycliq.github.io/pciSeq_3d/api/reference#fit) and
[`stage_image`](https://acycliq.github.io/pciSeq_3d/api/working-with-the-image#stage-image).

## Background image

`fit` does not use the image. The image is tiled separately by `stage_image` into an
`.mbtiles` file in the same folder: a pyramid of tiles at several zoom levels, which allows
an image too large to load at once to be panned and zoomed.

```python
from skimage import io
import pciSeq

dapi = io.imread('/path/to/dapi.tif')                 # (Z, H, W), or (H, W) for a 2D image
pciSeq.stage_image(img=dapi, out_dir='/path/to/viewer_data', name='dapi')
```

The file is named after `name`, here `dapi.mbtiles`, which is also the label shown in the
viewer. `stage_image` requires libvips, which on most platforms is installed with
pciSeq's `pyvips[binary]` dependency.

### Channels

Each `.mbtiles` file in the folder is a channel, for example DAPI and a second stain.
`stage_image` is called once per image with a distinct `name`, and `tint` assigns a
colour to distinguish them:

```python
pciSeq.stage_image(img=dapi,  out_dir=viewer_data, name='dapi')                    # grey
pciSeq.stage_image(img=gcamp, out_dir=viewer_data, name='gcamp', tint='#00FF00')   # green
```

The tiles are stored in greyscale; the tint is saved in the file and applied at render
time. Radio buttons at the top right of the map switch between channels. One channel is
shown at a time; by default, the one whose file name sorts first.

## Opening a folder

The viewer opens on a welcome screen. **Open Data Folder** (also **File, Open Dataset**,
Ctrl+O) prompts for the `viewer_data` folder. The viewer verifies that the Arrow folders
are present and locates the remaining files automatically: each `.mbtiles` file as a
channel, and `diagnostics/diagnostics.db` for the diagnostics and the agent.

Three properties are read from the files, and requested from the user when missing:

- **Image size and number of planes** are read from the `.mbtiles` file. If the folder
  contains no `.mbtiles` file, a dialog requests the width, height and plane count, and
  the map is drawn without a background.
- **Voxel size**, in microns per pixel along x, y and z, is read from `diagnostics.db`,
  where the run recorded its `voxel_size` setting. If the file is absent, a dialog
  requests the three values, which are stored for that folder.
- **An alternative background** can be selected with **File, Open Background Tiles**:
  one or more `.mbtiles` files from any location.

The folder can also be passed on the command line, which bypasses the welcome screen:

```bash
pciSeq_viewer --data=/path/to/viewer_data
```

**File, Close Dataset** returns to the welcome screen. The viewer never writes to the data
folder, which may therefore be read-only.
