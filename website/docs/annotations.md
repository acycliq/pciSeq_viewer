---
title: Annotations
description: Regions drawn on the map or imported from file, and sets of cells outlined by the agent.
---

# Annotations

The Annotations section of the drawer contains two types of annotation: **regions**,
outlines drawn on the map or imported from a file, and **cell annotations**, sets of cells
drawn with their own outlines. Each entry has a visibility toggle and a delete button; a
double-click on a name renames it.

Annotations are held in memory for the session, as layers are in an image editor, and are
written to a file only on **Save**. Closing the window or loading another dataset with unsaved
changes prompts for confirmation. Nothing is written to the data folder.

## Regions

**Draw** starts a region. Each click places a point, while dragging still pans the map.
Clicking the first point again, or pressing **Enter**, closes the outline; **Backspace**
removes the last point and **Esc** cancels. New regions are named Region 1, Region 2 and
so on, with the name open for editing.

<figure class="shot">
<img src="/img/annotations.png" alt="A region drawn round the dentate gyrus, listed in the Annotations section">
<figcaption>A region drawn on the map and its entry in the list.</figcaption>
</figure>

**Save** writes the current annotations to a GeoJSON file at a chosen location, with one
polygon per region in image pixel coordinates. **Open** reads a saved file and replaces
the list. It also accepts:

- GeoJSON polygons created in other software, in image pixel coordinates;
- region outlines as **CSV** files with columns `x` and `y` in image pixel coordinates,
  one region per file, named after the file and added to the list.

Regions can be referred to in questions to the agent, for example "my CA1" or "the region
I drew"; the agent can count or list the cells within a region, a cell being counted as
inside when its centroid is.

## Cell annotations

Cell annotations are created by the agent on request, for example "outline the Sncg cells
in my CA1": a set of cells, each drawn with its outline merged across all planes, so that
it is visible on any plane. They are listed, hidden, saved and opened in the same way as
regions, and marked *chat*. The file stores the cell labels, not their shapes; the
outlines are drawn from the run.
