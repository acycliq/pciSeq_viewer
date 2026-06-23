---
title: 3D Voxel Viewer
description: Render a selected region of the dataset as voxels in true 3D.
---

# 3D Voxel Viewer

The voxel viewer renders a region of your dataset in true 3D, cells, spots, and
boundaries placed in a voxel scene you can orbit, rather than a stack of 2D
planes. Internally it is the "chunk viewer": it shows the **chunk** of tissue you
select, not the whole dataset.

## Opening it

The voxel viewer opens automatically from the
[selection tool](./selection-tool):

1. Turn on **Selection tool** in the **Tools** section of the controls drawer.
2. Draw a rectangle on the map.
3. The viewer clips the spots and cells inside that rectangle and opens them in a
   new 3D window.

Because it works on the selected region, you get a responsive 3D view even for
very large datasets, you are only ever rendering one chunk at a time.

## What it offers

- **3D scene**, the selected cells and spots built into a voxel grid, navigable
  in three dimensions.
- **Genes panel**, show/hide genes within the 3D scene.
- **Hidden cells panel**, manage which cells are excluded from the scene.
- **Z-slider**, move through depth.
- **Tooltips**, hover for per-object details.
