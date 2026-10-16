---
title: The drawer
description: The sections of the drawer at the side of the map, section by section.
---

# The drawer

The drawer slides out from the rail on the left of the map. It holds everything that
is not the map itself, in collapsible sections; a click on a section's title opens or
closes it.

<figure class="shot narrow">
<img src="/img/drawer.png" alt="The drawer with the Cell Classes and Genes sections open">
<figcaption>The Cell Classes and Genes sections. The eye hides a row on the map, the box on top filters the list by name.</figcaption>
</figure>

## Cell classes

Every class of the run with its colour and the number of cells assigned to it, largest
first. The eye hides or shows the cells of a class on the map, **Show All** and **Hide
All** do it for every class, and the box on top filters the list by name. The list can
be made taller by dragging its bottom edge, and the pop-out button in its header opens
it in a window of its own, for a second monitor; the two stay in step.

Hide all, then show one class, to see where that class lives in the section.

## Cell charts

Three summaries of the whole run, each opening in a panel over the map:

- **Classes by Z**, the number of cells of each class per plane, so a class that lives
  in a layer shows as a band.
- **Class distribution**, the share of each class in the run.
- **Class gene counts**, the distribution of the gene counts per cell, for each class.

## Genes

The same as the classes, for the genes: the glyph each gene is drawn with, its name and
its number of spots. The eye hides a gene's spots, the box filters the list, and the
list pops out like the classes. Hide all and show one or two genes to see where a gene
sits.

## Gene controls

How the spots are drawn:

- **Distribution** opens a chart of the selected gene's spot counts per plane.
- **Size** scales every spot, from 0.5 to 3 times.
- **Score filter** and **Intensity filter** hide the spots below a detection score or
  intensity, from 0 to 1. They apply when the run carries those columns.
- **Uniform size** draws every spot at the same size, instead of smaller the further its
  plane is from the one on screen (see [Planes](./the-map#planes)).

## Misreads

A misread is a spot the run assigned to the background rather than to any cell. Three
charts and two switches:

- **rho per gene**, the misread density the run estimated for each gene, in spots per
  unit volume. See
  [misread density](https://acycliq.github.io/pciSeq_3d/the-model/misread-density) on
  the pciSeq site.
- **Assigned vs misread**, the spots of each gene split into those assigned to a cell
  and those called misreads.
- **Per plane**, the misread counts per plane for one gene.
- **Grey out misreads** keeps the misread spots on the map but faded; **Hide misreads**
  removes them.

## Annotations

Regions drawn on the map, saved to a file and opened again, and sets of cells outlined by
the agent. They have [their own page](./annotations).

## Layers

What is drawn on the map:

- **Background**, the image, with the key **T**.
- **Cells**, the outlines, with the key **P**, and **Opacity** for their fill.
- **Cells from all planes** draws the cells of every plane at once instead of the
  current plane's only. **Min genes** and **Max genes** then keep only the cells whose
  gene count is in the range. **Export per-class PNGs** saves one picture per class of
  the cells in a rectangle dragged on the map, with a transparent background, bundled
  in one zip so that there is one save dialog rather than one per class.

The key **A** lays the cell outlines of every plane over the current one, faintly, the
All Planes overlay: the depth of the tissue as a sketch behind the plane on screen. It
has no switch in the drawer.

## Tools

The **Selection tool**. With it on, hold **Ctrl** and drag a rectangle on the map, and
a second window opens with that piece of the tissue in 3D. See [The 3D view](./3d-view).
While the tool is on, **Esc** closes the drawer first and cancels the selection second.
