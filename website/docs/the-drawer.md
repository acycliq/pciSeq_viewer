---
title: The drawer
description: The sections of the drawer at the side of the map.
---

# The drawer

The drawer opens from the rail on the left of the map. It contains all controls other than
the map itself, arranged in collapsible sections; clicking a section title expands or
collapses it.

<figure class="shot narrow">
<img src="/img/drawer.png" alt="The drawer with the Cell Classes and Genes sections open">
<figcaption>The Cell Classes and Genes sections. The eye icon hides a row on the map; the field at the top filters the list by name.</figcaption>
</figure>

## Cell classes

All classes of the run, with their colours and the number of cells assigned to each,
sorted in descending order. The eye icon hides or shows the cells of a class on the map,
**Show All** and **Hide All** apply to every class, and the field at the top filters the
list by name. The list can be resized by dragging its bottom edge, and the pop-out button
in its header opens it in a separate window, for example on a second monitor; the two
remain synchronised.

Hiding all classes and then showing a single class reveals the spatial distribution of
that class in the section.

## Cell charts

Three summaries of the whole run, each opening in a panel over the map:

- **Classes by Z:** the number of cells of each class per plane, so that a class confined
  to a layer appears as a band.
- **Class distribution:** the proportion of each class in the run.
- **Class gene counts:** the distribution of gene counts per cell, for each class.

## Genes

The gene equivalent of the class list: the glyph of each gene, its name and its number of
spots. The eye icon hides the spots of a gene, the field filters the list, and the list
can be opened in a separate window as with the classes. Hiding all genes and showing one
or two reveals their spatial distribution.

## Gene controls

Controls for how the spots are drawn:

- **Distribution** opens a chart of the selected gene's spot counts per plane.
- **Size** scales all spots, from 0.5 to 3 times.
- **Score filter** and **Intensity filter** hide spots below a detection score or
  intensity threshold, from 0 to 1. They apply when the run includes those columns.
- **Uniform size** draws all spots at the same size, rather than scaling them by the
  distance of their plane from the current one (see [Planes](./the-map#planes)).

## Misreads

A misread is a spot that the run assigned to the background rather than to a cell. The
section contains three charts and two switches:

- **rho per gene:** the misread density estimated for each gene, in spots per unit volume.
  See [misread density](https://acycliq.github.io/pciSeq_3d/the-model/misread-density) on
  the pciSeq site.
- **Assigned vs misread:** the spots of each gene, divided into those assigned to a cell
  and those classified as misreads.
- **Per plane:** the misread counts per plane for one gene.
- **Grey out misreads** keeps misread spots on the map but dimmed; **Hide misreads**
  removes them.

## Annotations

Regions drawn on the map, saved to and opened from a file, and sets of cells outlined by
the agent. They are described on [their own page](./annotations).

## Layers

The layers drawn on the map:

- **Background:** the background image, toggled with **T**.
- **Cells:** the cell outlines, toggled with **P**, with **Opacity** controlling their fill.
- **Cells from all planes:** draws the cells of all planes rather than of the current plane
  only. **Min genes** and **Max genes** then restrict the cells drawn to those whose gene
  count lies within the range. **Export per-class PNGs** saves one image per class of the
  cells within a rectangle dragged on the map, with a transparent background; the images
  are bundled in a single zip file, so that only one save dialog is shown.

The **A** key overlays the cell outlines of all planes, faintly, on the current plane (the
All Planes overlay), indicating the depth of the tissue behind the current plane. It has
no switch in the drawer.

## Tools

The **Selection tool**. When it is enabled, holding **Ctrl** and dragging a rectangle on
the map opens a second window with that region of tissue in 3D; see
[The 3D view](./3d-view). While the tool is enabled, the first press of **Esc** closes the
drawer and the second cancels the selection.
