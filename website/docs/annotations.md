---
title: Annotations
description: Regions drawn on the map, region outlines from file, and sets of cells outlined by the agent.
---

# Annotations

The Annotations section of the drawer holds two kinds of thing: **regions**, outlines
drawn on the map or read from a file, and **cell annotations**, sets of cells drawn with
their own outlines. Both are listed with an eye to hide them and a bin to delete them;
double-click a name to rename it.

Annotations are kept in memory while you work, like layers in an image editor, and
written to a file only when you press **Save**. Closing the window or opening another
run with unsaved changes asks first. Nothing is written into the data folder.

## Regions

**Draw** starts a region. Click to place its points, a drag still pans the map. Click
the first point again, or press **Enter**, to close the outline; **Backspace** removes
the last point and **Esc** stops. A new region is called Region 1, Region 2 and so on,
with the name open for editing.

<figure class="shot">
<img src="/img/annotations.png" alt="A region drawn round the dentate gyrus, listed in the Annotations section">
<figcaption>A region drawn by hand, and its row in the list.</figcaption>
</figure>

**Save** writes the current annotations to a GeoJSON file, one polygon per region in
image pixels, at a place you choose. **Open** reads a saved file back, replacing the
list. It also opens:

- plain GeoJSON polygons made in other software, in image pixels;
- region outlines as **CSV** files with columns `x` and `y` in image pixels, one region
  per file, named after the file and added to the list.

A region is what the agent means by "my CA1" or "the region I drew": it can count or
list the cells inside it, where a cell is inside when its centroid is.

## Cell annotations

The agent adds these on request, "outline the Sncg cells in my CA1" for example: a set
of cells, each drawn with its own outline from every plane together, so they show
whichever plane is on screen. They are listed, hidden, saved and opened like regions,
and marked *chat*. The file keeps their labels, not their shapes; the outlines are drawn
from the run.
