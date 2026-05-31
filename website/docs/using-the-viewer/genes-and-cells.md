---
sidebar_position: 2
title: Genes & Cell Classes
description: Show, hide, filter, and size gene spots and cell classes.
---

# Genes & Cell Classes

The viewer colours every **spot** by its gene and every **cell** by its
predicted cell class. Two controls-drawer sections let you decide what is shown
and how.

## Cell Classes section

- **Show All / Hide All**, toggle every cell class at once.
- **Filter classes…**, type to narrow the list; only matching classes are
  shown in the legend.
- **Per-class toggle**, each class in the list has its own visibility toggle
  and colour swatch. Hidden classes are removed from the map.

The list can be resized by dragging its bottom edge.

## Genes section

- **Show All / Hide All**, toggle every gene's spots at once.
- **Filter genes…**, type to narrow the gene list.
- **Per-gene toggle**, each gene has its own toggle and glyph/colour. Hidden
  genes have their spots removed from the map.

## Gene Controls section

Fine-tune how spots are drawn:

- **Size**, a slider scaling spot glyph size (`0.5`–`3.0`).
- **Score Filter**, hides spots below the chosen detection score (`0`–`1`).
- **Intensity Filter**, hides spots below the chosen detection intensity
  (`0`–`1`).
- **Uniform Size**, when on, all spots are drawn the same size instead of
  scaling with z-distance.
- **Distribution**, opens the gene distribution chart (see
  [Charts & Misreads](./charts-and-misreads)).

## How spots are drawn

The viewer shows **all spots from all z-planes at once**, and adapts how each one
is drawn to the zoom level and to depth.

### Dots when zoomed out, glyphs when zoomed in

The map zoom runs from `0` to `8`.

- **Zoomed out (zoom below 7)**, every spot is a simple coloured **dot**. This
  is a single fast layer that copes with millions of points; the colour still
  encodes the gene, but all spots share one shape.
- **Zoomed in (zoom 7 and above)**, the spots in view **morph into their
  per-gene glyphs** (the star / triangle / etc. shapes).

### Spot size depends on the plane, not the camera

A spot's size depends on **how many z-planes away it sits from the plane you are
currently viewing**, not on any perspective "closer to the screen is bigger"
effect. Spots on the current plane are the largest; spots on more distant planes
shrink, following `1 / √(1 + |Δplane|)`:

| Planes from current | Relative size |
|---|---|
| 0 (current plane) | 1.00 (largest) |
| 1 | 0.71 |
| 3 | 0.50 |
| 8 | 0.33 |

This depth cue applies to both the dots and the glyphs. The **Size** slider
scales everything on top of it, and **Uniform Size** turns the depth cue off so
every spot is drawn at the same size.

### Glyph shapes

Each gene is assigned a glyph (shape) as well as a colour. The renderer defines
these shapes:

`star6`, `star5`, `diamond`, `square`, `triangleUp`, `triangleDown`,
`triangleRight`, `triangleLeft`, `tShapeTop`, `tShapeBottom`, `tShapeLeft`,
`tShapeRight`, `cross`, `plus`, `asterisk`, `circle`, `point`.

The four `tShape*` shapes are the T / tau family, a capital T pointing up, down,
left, or right. An unrecognised shape name falls back to `circle`.

You can assign any of these shapes to a gene through
[Custom Colours](./color-import).

## Pop-out windows

The Cell Classes and Genes panels can be **undocked** into their own window
using the pop-out button in the panel header. This is handy on a second monitor
while you navigate the map. Selections stay in sync between the docked panel and
the undocked window.

:::note[Screenshot]

Capture the controls drawer with the Cell Classes and Genes sections expanded,
plus an undocked gene window. Save as `static/img/genes-and-cells.png`.

:::
