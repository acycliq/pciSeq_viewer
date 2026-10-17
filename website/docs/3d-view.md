---
title: The 3D view
description: A rectangle drawn on the map opens a second window in which that region of tissue is rendered as voxels.
---

# The 3D view

The map shows one plane at a time. The 3D view shows a region of tissue across all planes:
the cells, their boundaries and the spots are rendered as voxels in a scene that can be
rotated, zoomed and sliced. It operates on a selected region rather than the whole section,
which keeps it responsive on large runs.

## Selection

Enable the **Selection tool** in the Tools section of [the drawer](./the-drawer), then hold
**Ctrl** and drag a rectangle on the map. On release, a second window opens containing the
contents of the rectangle across every plane of the stack.

<figure class="shot">
<img src="/img/3d-open.png" alt="A rectangle drawn round two cells on the map, and the 3D window that opened with the region as a pillar of voxels">
<figcaption>The rectangle on the map and the resulting 3D view. The box spans the full depth of the stack, so a small rectangle produces a tall column.</figcaption>
</figure>

The agent opens the same window around a cell when asked to show it in 3D, including the
cell and its immediate neighbours.

## Scene

Dragging rotates the scene; scrolling zooms towards the point under the cursor. Hovering
over a voxel shows the cell it belongs to, and over a spot, its gene and cell.

The region is composed of three types of voxel:

- **Cell voxels:** the interior of each cell, in the colour of its class.
- **Boundary voxels:** the outline of each cell, in the same colour.
- **Background voxels:** all voxels outside the segmented cells, in grey.

Each spot is drawn as a small marker in the colour of its gene, at its position in the
stack. **Spot to cell assignments** draws a line from each spot to the cell it was
assigned to.

<figure class="shot">
<img src="/img/3d-cells.png" alt="The region with the background voxels off: two cells as voxels, the spots inside them, and the lines from the spots to their cells">
<figcaption>Background voxels off, cell voxels on. The spots lie inside the cells they were assigned to; the lines show the assignments.</figcaption>
</figure>

The switches in the panel on the right toggle each of these elements. A useful
configuration is background voxels off, cell voxels off and boundary voxels on, which
renders the cells as shells with their spots visible inside.

## Slice

The slider on the right cuts the scene at a plane. Everything above the cut is removed, so
moving the slider down steps through the stack plane by plane; with **Ghosting** enabled,
the removed voxels remain as translucent ghosts. The slider starts at the top plane, with
the whole region shown.

<figure class="shot">
<img src="/img/3d-slice.png" alt="The region sliced at a plane through the middle of a cell, with the boundary voxels on and the spots inside">
<figcaption>Boundary voxels only, sliced through a cell: the spots assigned to the cell lie within its outline.</figcaption>
</figure>

## Visibility

The two lists at the top of the panel contain the classes and genes in the region, each
with a filter and **Show All** and **Hide All** buttons. Clicking a row hides the cells of
that class, or the spots of that gene. Hiding a class hides its voxels; its spots and their
assignment lines remain visible.

**Ctrl+Click** on a cell hides that cell alone, to reveal what lies behind it. The number
of hidden cells is shown in the last section of the panel, and **Show All** restores them.
