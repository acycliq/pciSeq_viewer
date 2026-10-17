---
title: The map
description: The main window of pciSeq Viewer, the planes, how spots and cells are drawn, the cell panel, and cell search.
---

# The map

The main window is a map of one plane of the section: the background image, the cell
outlines filled with the colour of each cell's assigned class, and the spots drawn with
one glyph per gene. Dragging pans the map, scrolling zooms, and the slider at the bottom
selects the plane.

<figure class="shot">
<img src="/img/map.png" alt="The main window: the section on the DAPI, cells coloured by class, spots coloured by gene, the drawer open on the left and the cell panel at the bottom right">
<figcaption>The main window with the cursor over an oligodendrocyte; lines connect the cell to its spots. The drawer is on the left, the plane slider at the bottom, the cell panel at the bottom right, and the chat and help buttons at the top right.</figcaption>
</figure>

The map is surrounded by:

- **The rail**, the strip on the left, which opens and closes [the drawer](./the-drawer)
  containing the gene, class, chart and layer controls. Its magnifier opens
  [Cell search](#cell-search).
- **The plane bar** at the bottom: previous and next buttons, a slider and the plane number.
- **The scale bar** and the cursor coordinates, in pixels and in microns.
- **The channel selector**, at the top right, when the folder contains more than one
  background image; see [Loading the data](./loading-data#channels).
- **The chat button**, which opens [the chat panel](./ai-agent#chat-panel), and the `?`
  button, which opens a description of the viewer and a guided tour of the controls, also
  available under **Help, Take a Tour**.

## Planes

The map shows one plane at a time, selected with the slider or the keyboard: **Left** and
**Right** move one plane, **PageUp** and **PageDown** ten, and **Home** and **End** go to
the first and last planes.

The spots of all planes are drawn simultaneously, and the size of each spot encodes the
distance between its plane and the current one. Spots on the current plane are drawn
largest. The size decreases with the square root of one plus the number of intervening
planes, so a spot three planes away is drawn at half size and one eight planes away at a
third. The spots of a cell on the current plane are therefore drawn large, while those of
cells above and below recede. The **Size** slider in the drawer scales all spots, and
**Uniform Size** disables the depth encoding.

The cells, by contrast, are drawn for the current plane only, each outline taken from the
segmentation of that plane. **Cells from all planes**, in the Layers section of the drawer,
draws the cells of all planes superimposed, so that the full depth of the tissue appears
in a single image.

## Spots and cells

Each spot is coloured by its gene and each cell by its class, using the colours shown in
the Genes and Cell Classes sections of the drawer or those of an imported
[colour file](./custom-colours).

The representation of the spots depends on the zoom level. At low zoom, each spot is a
coloured dot, drawn in a single layer that scales to millions of points. From zoom level 7
(of the map's range 0 to 8), the spots in view are drawn with per-gene glyphs, such as a
star or a triangle, so that neighbouring genes can be distinguished. The glyph of each gene
is shown next to it in the drawer.

A cell is drawn as its outline, filled with its class colour at the opacity set in the
Layers section. Hovering over a cell highlights it, draws a line from the cell to each of
its spots in the colour of the spot's gene, and populates the cell panel.

## Cell panel

The panel at the bottom right describes the cell under the cursor. It has three parts: the
genes of the cell and their counts, a donut chart of the cell's class probabilities, and a
legend of the classes in the chart.

<figure class="shot narrow">
<img src="/img/cell-panel.png" alt="The cell panel: a table of gene counts, a donut of the class probabilities, the class legend">
<figcaption>A confident assignment appears as a single dominant segment; an ambiguous one, as several.</figcaption>
</figure>

The counts are soft: each spot contributes its probability of belonging to the cell, so
the counts are rarely integers. For example, four Plp1 spots assigned to the cell with
probability 1 and one with probability 0.3 give a count of 4.3.

The panel follows the cursor. **Click** on a cell freezes the panel on that cell, so that
the cursor can be moved onto the panel; a lock icon in the header indicates the frozen
state. **Esc**, or a click on the empty background, unfreezes it.

When `diagnostics.db` is present, **Ctrl+Click** on a cell or a spot opens
[the diagnostics](./diagnostics), which show the values behind its assignment.

## Cell search

The magnifier on the rail, or **Ctrl+F**, opens a field for a cell label, the number of the
cell in the segmentation. On entry, the map moves to that cell and briefly highlights its
outline. The agent performs the same action when asked to show a cell.
