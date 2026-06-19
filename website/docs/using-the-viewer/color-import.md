---
sidebar_position: 10
title: Custom Colours
description: Import your own gene and cell-class colour schemes as JSON.
---

# Custom Colours

By default the viewer assigns colours to genes and cell classes automatically.
You can override these with your own colour schemes, supplied as `.json` files.

In the menu bar, under **Import**:

- **Gene Colours…**, colours and glyphs for genes.
- **Cell Class Colours…**, colours for cell classes.

Once imported, the new colours apply across the map, the legends, and the
charts. Hex colours are six digits, with or without a leading `#`.

## Gene Colours format

A JSON **array** of objects, one per gene:

```json
[
  { "gene": "Gad1", "colour": "#1f77b4", "glyphName": "star6" },
  { "gene": "Slc17a7", "colour": "#d62728", "glyphName": "triangleUp" }
]
```

- `gene`, the gene name (must match a gene in your dataset).
- `colour`, a 6-digit hex colour (`color` is also accepted).
- `glyphName`, the marker shape. One of the 17 supported names:
  `star6`, `star5`, `diamond`, `square`, `triangleUp`, `triangleDown`,
  `triangleRight`, `triangleLeft`, `tShapeTop`, `tShapeBottom`, `tShapeLeft`,
  `tShapeRight`, `cross`, `plus`, `asterisk`, `circle`, `point`. Anything else
  falls back to `circle`.

Any gene left without a colour is drawn as a white (`#ffffff`) circle.

## Cell Class Colours format

A JSON **array** of `{ className, colour }` objects, the same shape as the
built-in colour schemes:

```json
[
  { "className": "016 CA1-ProS Glut", "colour": "#28A745" },
  { "className": "025 CA2-FC-IG Glut", "colour": "#A4C400" },
  { "className": "017 CA3 Glut", "colour": "#2BAF8A" }
]
```

The colour field may be spelled either `colour` or `color`, both are accepted.

Class names must match the classes in your dataset; entries whose names don't
match are reported and skipped. Any cell class left without a colour is drawn in
the default grey, `#C0C0C0`.

:::tip[Reference schemes]

The built-in schemes under `config/colorSchemes/` (for example `hippocampus.js`,
`zeisel.js`, `allen.js`) are a useful reference for authoring your own.

:::
