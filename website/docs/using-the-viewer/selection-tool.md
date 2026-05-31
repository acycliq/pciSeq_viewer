---
sidebar_position: 5
title: Selection & Regions
description: Select an area of the map and import anatomical region boundaries.
---

# Selection & Regions

The viewer offers two ways to work with areas of tissue: an interactive
rectangle **selection tool**, and **region** boundaries you import from file.

## Selection tool

Turn on **Selection tool** in the **Tools** section of the controls drawer, then
draw a rectangle on the map. The viewer clips the spots and cells inside the
rectangle and opens them in the [3D voxel viewer](./voxel-viewer), so a
selection is how you drill into a region in 3D.

### Cancelling with Escape

`Escape` is two-step while the selection tool is active:

1. First `Escape` hides the controls drawer.
2. Second `Escape` cancels the rectangle selection.

## Regions

The **Regions** section imports anatomical region boundaries so you can overlay
named areas (for example brain structures) on the map.

- **Import Regions**, load one or more boundary **CSV** files. Each becomes a
  named region in the list.
- **Region list**, every imported region has a visibility toggle and a delete
  control. Imported regions are remembered between sessions.
