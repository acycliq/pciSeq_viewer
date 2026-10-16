---
title: The map
description: The main window of pciSeq Viewer, the planes, how spots and cells are drawn, the cell panel, and going to a cell.
---

# The map

The main window is a map of one plane of the section: the background image underneath,
the cell outlines filled with the colour of the class each cell was assigned to, and the
spots as one glyph per gene. Drag to move, scroll to zoom, and the slider at the bottom
moves through the planes.

<figure class="shot">
<img src="/img/map.png" alt="The main window: the section on the DAPI, cells coloured by class, spots coloured by gene, the drawer open on the left and the cell panel at the bottom right">
<figcaption>The main window, the mouse on an oligodendrocyte: the lines go from the cell to its spots. The drawer on the left, the plane slider at the bottom, the cell panel at the bottom right, the chat bubble and the help button at the top right.</figcaption>
</figure>

Around the map:

- **The rail**, the strip on the left. It opens and closes [the drawer](./the-drawer),
  where the genes, the classes, the charts and the layers are. Its magnifier is
  [Cell search](#cell-search).
- **The plane bar** at the bottom: previous and next, a slider, and the plane number.
- **The scale bar** and the coordinates under the cursor, in pixels and in microns.
- **The channels**, at the top right, when the folder holds more than one background
  image, see [Loading the data](./loading-data#channels).
- **The chat bubble** opens [the chat panel](./ai-agent#chat-panel), and the `?`
  button a description of the viewer and a tour of the controls, also under **Help,
  Take a Tour** in the menu.

## Planes

The map shows one plane at a time, chosen with the slider or the keyboard: **Left** and
**Right** step one plane, **PageUp** and **PageDown** ten, **Home** and **End** go to
the first and the last.

The spots of every plane are drawn at once, and the size of a spot tells how far its
plane is from the plane on screen. A spot on the current plane is drawn largest. The
size falls with the square root of one plus the number of planes in between, so a spot
three planes away is drawn at half size and one eight planes away at a third. A cell on
the current plane has its spots large, and the spots of the cells above and below it
fade into the background. The **Size** slider in the drawer scales everything on top of this,
and **Uniform Size** switches the depth cue off.

The cells, in contrast, are only those of the current plane, each outline cut from the
segmentation of that plane. **Cells from all planes** in the Layers section of the
drawer draws the cells of every plane at once, laid over each other, so the whole depth
of the tissue is in one picture.

## Spots and cells

Every spot is coloured by its gene and every cell by its class, with the colours from
the Genes and Cell Classes sections of the drawer, or from a
[colour file](./custom-colours).

The spots change shape with the zoom. Zoomed out, every spot is a coloured dot, one fast
layer that copes with millions of points. From zoom 7 of the map's 0 to 8 the spots in
view become their per-gene glyphs, a star for one gene, a triangle for another, so a
gene can be told from its neighbours at a glance. The glyph of each gene is listed next
to it in the drawer.

A cell is drawn as its outline, filled with its class colour at an opacity set in the
Layers section. Hover a cell and it is highlighted, with a line from the cell to each of its spots
in the colour of the spot's gene, and the cell panel fills with it.

## Cell panel

The panel at the bottom right is about the cell under the mouse. It has three parts:
the genes the cell holds and their counts, a donut of the cell's class probabilities,
and the legend of the classes in the donut.

<figure class="shot narrow">
<img src="/img/cell-panel.png" alt="The cell panel: a table of gene counts, a donut of the class probabilities, the class legend">
<figcaption>A confident call has one big slice. A cell that could be one of several classes has several.</figcaption>
</figure>

The counts are soft: each spot contributes its probability of belonging to the cell, so
they are rarely whole numbers. Four spots of Plp1 assigned to the cell with probability
1 and one with probability 0.3 give a count of 4.3.

The panel follows the mouse. **Click** a cell to freeze the panel on it, so the mouse
can move onto the panel and read it; a small lock shows in its header while it is
frozen. **Esc**, or a click on the empty background, unfreezes it.

With `diagnostics.db` in the folder, **Ctrl+Click** on a cell or on a spot opens
[the diagnostics](./diagnostics), the numbers behind its call.

## Cell search

The magnifier on the rail, or **Ctrl+F**, opens a box for a cell label. Type the label,
the number of the cell in the segmentation, and the map flies to that cell and flashes
its outline. The agent does the same when asked to show a cell.
