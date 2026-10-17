---
title: Custom colours
description: Gene and class colours and gene glyphs, imported from a JSON file.
---

# Custom colours

The viewer assigns a colour to each class and a colour and glyph to each gene. Both can be
replaced from the **Import** menu, with **Gene Colours** and **Cell Class Colours**, each
of which reads a JSON file. Imported colours apply to the map, the drawer and the charts.
Colours are six-digit hexadecimal values, with or without the leading `#`, and the key may
be spelled `colour` or `color`.

## Gene colours

A list with one object per gene:

```json
[
  { "gene": "Gad1",    "colour": "#1f77b4", "glyphName": "star6" },
  { "gene": "Slc17a7", "colour": "#d62728", "glyphName": "triangleUp" }
]
```

`glyphName` is one of the seventeen shapes supported by the renderer: `star6`, `star5`,
`diamond`, `square`, `triangleUp`, `triangleDown`, `triangleRight`, `triangleLeft`,
`tShapeTop`, `tShapeBottom`, `tShapeLeft`, `tShapeRight`, `cross`, `plus`,
`asterisk`, `circle`, `point`. Any other name defaults to `circle`. Genes not listed in
the file are drawn as white circles.

## Class colours

A list of class names and colours, in the same format as the viewer's built-in schemes:

```json
[
  { "className": "016 CA1-ProS Glut", "colour": "#28A745" },
  { "className": "025 CA2-FC-IG Glut", "colour": "#A4C400" },
  { "className": "017 CA3 Glut",      "colour": "#2BAF8A" }
]
```

Names must match the classes of the run; unmatched entries are reported and ignored.
Classes not listed in the file are drawn in grey, `#C0C0C0`.

The schemes in `config/colorSchemes/` in the source (`hippocampus.js`, `zeisel.js` and
`allen.js`) can serve as templates for a new file.
