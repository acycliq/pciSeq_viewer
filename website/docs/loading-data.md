---
sidebar_position: 3
title: Loading Data in the Viewer
description: Open a prepared dataset and set the voxel size.
---

# Loading Data in the Viewer

1. **Launch the application.**

2. **Select your data folder.**
   - Go to **File → Open Dataset…**
   - Navigate to your data folder
     (e.g. `/path/to/my_dataset/pciSeq/data/viewer_data`).
   - Click **Select Folder**.

3. **Enter the voxel size.**
   - The app prompts for voxel size (microns per pixel).
   - Enter values for X, Y, and Z (e.g. `0.28`, `0.28`, `0.7`).

4. **The viewer loads automatically:**
   - Background image from `output.mbtiles`
   - Gene spots from `arrow_spots/`
   - Cell boundaries from `arrow_boundaries/`
   - Cell information from `arrow_cells/`

:::note[No MBTiles?]

Add an `image_dims.json` file next to your data folders:

```json
{ "width": 6411, "height": 4412, "plane_count": 102 }
```

Width and height are in pixels. The app reads these dimensions from the MBTiles
when present; otherwise it falls back to `image_dims.json`. Voxel size is always
entered on the welcome screen.

:::
