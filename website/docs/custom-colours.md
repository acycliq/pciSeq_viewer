---
title: Custom colours
description: Colours and glyphs for the genes and the classes, read from a JSON file.
---

# Custom colours

The viewer picks a colour for every class and a colour and a glyph for every gene. Both
can be replaced from the **Import** menu: **Gene Colours** and **Cell
Class Colours**, each a JSON file. Once imported the colours apply to the map, the
drawer and the charts. Hex colours are six digits, with or without the leading `#`,
and the key may be spelled `colour` or `color`.

## Gene colours

A list, one object per gene:

```json
[
  { "gene": "Gad1",    "colour": "#1f77b4", "glyphName": "star6" },
  { "gene": "Slc17a7", "colour": "#d62728", "glyphName": "triangleUp" }
]
```

`glyphName` is one of the seventeen shapes the renderer draws: `star6`, `star5`,
`diamond`, `square`, `triangleUp`, `triangleDown`, `triangleRight`, `triangleLeft`,
`tShapeTop`, `tShapeBottom`, `tShapeLeft`, `tShapeRight`, `cross`, `plus`,
`asterisk`, `circle`, `point`. Any other name falls back to `circle`. A gene the file
leaves out is drawn as a white circle.

## Class colours

A list of class name and colour, the same shape as the viewer's own schemes:

```json
[
  { "className": "016 CA1-ProS Glut", "colour": "#28A745" },
  { "className": "025 CA2-FC-IG Glut", "colour": "#A4C400" },
  { "className": "017 CA3 Glut",      "colour": "#2BAF8A" }
]
```

Names must match the classes of the run; entries that match nothing are reported and
skipped. A class the file leaves out is drawn in grey, `#C0C0C0`.

The schemes under `config/colorSchemes/` in the source, `hippocampus.js`, `zeisel.js`
and `allen.js`, are a starting point for a new file.
