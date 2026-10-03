---
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

The **Annotations** section holds region boundaries, named areas (for example
brain structures) drawn as outlines on the map.

- **Draw**, draw a region on the map. Click to place points; a drag still pans
  the map. Click the first point again, or press `Enter`, to close the outline.
  `Backspace` removes the last point and `Escape` stops. A new region is named
  Region 1, Region 2, and so on, with the name open for editing.
- **Save**, write the current regions to a GeoJSON file at a location you choose.
- **Open**, read a saved GeoJSON file back, replacing the current regions. Plain
  GeoJSON polygons from other software open as well. Open also takes one or
  more boundary **CSV** files with columns `x` and `y` in image pixels; each is
  added to the list as a region named after its file.
- **Region list**, every region has a visibility toggle and a delete control.
  Double-click a name to rename it.
- **Cell annotations**, added by the AI chat on request ("outline the Sncg cells
  in my CA1"): a set of cells drawn with their own outlines from every plane
  together, so they show whichever plane is on screen. They are listed, saved
  and opened like regions, and marked *chat*. A cell counts as inside a region
  when its centroid does.

Regions are kept in memory only, as layers are in an image editor. Closing the
window or opening another dataset with unsaved changes asks whether to save
them first. Nothing is written to the data folder.
