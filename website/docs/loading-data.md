---
title: Loading the data
description: What a pciSeq run writes for the viewer, how the background image is tiled, and how the viewer opens the folder.
---

# Loading the data

The viewer reads one folder, `viewer_data`, written by a run of `pciSeq.fit` with
`save_data` on (the default). It sits under the run's `output_path`:

```
<output_path>/pciSeq/data/viewer_data/
├── arrow_spots/          # every spot: gene, position, plane, candidate cells
├── arrow_cells/          # every cell: centroid, class probabilities, gene counts
├── arrow_boundaries/     # the cell outlines, one file per plane
├── diagnostics/
│   └── diagnostics.db    # the terms behind every call, the settings, the voxel size
└── dapi.mbtiles          # the background image, added by stage_image
```

The Arrow folders are enough to draw the map. `diagnostics.db` is what the
[inspectors](./inspectors) and the [agent](./ai-chat) read, and it records
the voxel size. The `.mbtiles` file is the background image; without it the spots and the cells are
drawn on an empty background. [Data format](./reference/data-format) specifies each file.

The functions that write these files belong to pciSeq, not to the viewer:
[`fit`](https://acycliq.github.io/pciSeq_3d/api/reference#fit) and
[`stage_image`](https://acycliq.github.io/pciSeq_3d/api/working-with-the-image#stage-image).

## Background image

`fit` never sees the image. It is tiled separately, by `stage_image`, into an
`.mbtiles` file in the same folder: a pyramid of small tiles at several zoom levels, so
an image far too large to load at once can be panned and zoomed.

```python
from skimage import io
import pciSeq

dapi = io.imread('/path/to/dapi.tif')                 # (Z, H, W), or (H, W) for a 2D image
pciSeq.stage_image(img=dapi, out_dir='/path/to/viewer_data', name='dapi')
```

The file is named after `name`, here `dapi.mbtiles`, and `name` is also the label the
viewer shows for it. `stage_image` needs libvips, which arrives with pciSeq's
`pyvips[binary]` dependency on most platforms.

### Channels

Every `.mbtiles` in the folder is a channel the viewer can switch to, DAPI and a second
stain for example. Call `stage_image` once per image with a different `name`, and give
a colour with `tint` to tell them apart:

```python
pciSeq.stage_image(img=dapi,  out_dir=viewer_data, name='dapi')                    # grey
pciSeq.stage_image(img=gcamp, out_dir=viewer_data, name='gcamp', tint='#00FF00')   # green
```

The tiles stay greyscale; the tint is stored in the file and applied when it is drawn.
On the map, radio buttons at the top right switch between the channels. One channel is
shown at a time, the one whose file name sorts first opens by default.

## Opening a folder

The viewer starts on a welcome screen. **Open Data Folder** (also **File, Open
Dataset**, Ctrl+O) asks for the `viewer_data` folder. It checks that the Arrow folders
are there, then finds the rest by itself: every `.mbtiles` file as a channel, and
`diagnostics/diagnostics.db` for the inspectors and the agent.

Three things the viewer reads from the files, and asks for when they are missing:

- **The image size and the number of planes** come from the `.mbtiles` file. With no
  `.mbtiles` in the folder a dialog asks for the width, the height and the plane count,
  and the map is drawn without a background.
- **The voxel size**, microns per pixel in x, y and z, comes from `diagnostics.db`,
  where the run recorded its `voxel_size` setting. A folder without that file gets a
  dialog asking for the three values, which are remembered for that folder.
- **A different background** can be chosen with **File, Open Background Tiles**, one or
  more `.mbtiles` files from anywhere.

The folder can also be given on the command line, which skips the welcome screen:

```bash
pciSeq_viewer --data=/path/to/viewer_data
```

**File, Close Dataset** returns to the welcome screen. The viewer never writes into the
data folder; it may be read only.
