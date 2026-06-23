---
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

::: info Datasets without an MBTiles file

The viewer normally reads the image width, height, and plane count from the
`.mbtiles` file. If the data folder has no `.mbtiles`, those values cannot be
read automatically, and the viewer shows a dialog asking you to enter **Width**,
**Height** (in pixels), and **Plane count** manually. Spots, cells, and
boundaries still render, without a background image. Voxel size is always
entered on the welcome screen.

:::
