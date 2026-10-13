---
title: The 3D view
description: A rectangle drawn on the map opens a second window with that piece of the tissue built from voxels.
---

# The 3D view

The map shows one plane at a time. The 3D view shows a piece of the tissue through all
its planes at once: the cells, their boundaries and the spots become voxels in a scene
that can be turned, zoomed and sliced. It works on a region, not the whole section,
which is what keeps it quick on a large run.

## Selection

Switch the **Selection tool** on, in the Tools section of [the drawer](./the-drawer),
then hold **Ctrl** and drag a rectangle on the map. When the mouse is released a second
window opens with everything inside the rectangle, over every plane of the stack.

<figure class="shot">
<img src="/img/3d-open.png" alt="A rectangle drawn round two cells on the map, and the 3D window that opened with the region as a pillar of voxels">
<figcaption>The rectangle on the map and the region it opened. The whole depth of the stack is in the box, so a small rectangle gives a tall pillar.</figcaption>
</figure>

The agent opens the same window round a cell when asked to show it in 3D, with the
cell and its immediate neighbours.

## Scene

Drag to turn the scene, scroll to zoom on the point under the mouse. Hover a voxel for
the cell it belongs to, or a spot for its gene and its cell.

Three kinds of voxel make up the region:

- **Cell voxels**, the inside of each cell, in the colour of its class.
- **Boundary voxels**, the outline of each cell, in the same colour.
- **Background voxels**, everything the segmentation left outside the cells, in grey.

Each spot is a small marker in the colour of its gene, placed at its position in the
stack. **Spot to cell assignments** draws a line from each spot to the cell the run
assigned it to.

<figure class="shot">
<img src="/img/3d-cells.png" alt="The region with the background voxels off: two cells as voxels, the spots inside them, and the lines from the spots to their cells">
<figcaption>Background off, cell voxels on. The spots sit inside the cells they were assigned to, and the lines show the assignments.</figcaption>
</figure>

The switches in the panel on the right turn each of these on and off. The usual way
in is background off, then cell voxels off and boundary voxels on, which leaves the
cells as shells with their spots visible inside.

## Slice

The slider on the right cuts the scene at a plane. Everything above the slice is
removed, so dragging it down sinks through the stack and shows what each plane holds;
with **Ghosting** on, the removed voxels stay as faint ghosts instead. The slider
starts at the top plane, with the whole region shown.

<figure class="shot">
<img src="/img/3d-slice.png" alt="The region sliced at a plane through the middle of a cell, with the boundary voxels on and the spots inside">
<figcaption>Boundary voxels only, sliced through a cell: the spots the run assigned to it sit inside its outline.</figcaption>
</figure>

## Visibility

The two lists at the top of the panel are the classes and the genes in the region, each
with a filter box and **Show All** and **Hide All**. A click on a row hides that class's
cells, or that gene's spots. Hiding a class hides its voxels; its spots and their lines
stay.

**Ctrl+Click** on a cell hides that one cell, to see what is behind it. The hidden
cells are counted in the panel's last section, and **Show All** brings them back.
