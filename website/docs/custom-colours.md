---
title: Custom colours
description: Gene and class colours and gene glyphs, imported from a JSON file.
---

# Custom colours

The viewer assigns a colour to each class and a colour and glyph to each gene. Both can be
replaced from the **Import** menu, with **Gene Colours** and **Cell Class Colours**, each
of which reads a JSON file. Imported colours apply to the map, the drawer and the charts.
Colours are six-digit hexadecimal values; the leading `#` is optional for genes and required
for classes, and the key may
be spelled `colour` or `color`.

## Gene colours

A list with one object per gene:

```json
[
  { "gene": "Gad1",    "colour": "#1f77b4", "glyphName": "star6" },
  { "gene": "Slc17a7", "colour": "#d62728", "glyphName": "triangleUp" }
]
```

`glyphName` is one of the shapes listed under [Gene glyphs](#gene-glyphs); any other name
defaults to `circle`. Genes not listed in the file keep their current colour and glyph.

## Gene glyphs

The glyphs are drawn from zoom level 7; at lower zoom every spot is a coloured dot (see
[Spots and cells](./the-map#spots-and-cells)). The renderer supports seventeen shapes:

<div class="glyph-grid">
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6.4L38.4 20.91L54.17 19.2L44.8 32L54.17 44.8L38.4 43.09L32 57.6L25.6 43.09L9.83 44.8L19.2 32L9.83 19.2L25.6 20.91Z"/></svg><code>star6</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6.4L38.02 23.72L56.35 24.09L41.74 35.16L47.05 52.71L32 42.24L16.95 52.71L22.26 35.16L7.65 24.09L25.98 23.72Z"/></svg><code>star5</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3.84L57.6 32L32 60.16L6.4 32Z"/></svg><code>diamond</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14.08 6.4L49.92 6.4Q57.6 6.4 57.6 14.08L57.6 49.92Q57.6 57.6 49.92 57.6L14.08 57.6Q6.4 57.6 6.4 49.92L6.4 14.08Q6.4 6.4 14.08 6.4Z"/></svg><code>square</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3.84L57.6 55.04L6.4 55.04Z"/></svg><code>triangleUp</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 60.16L57.6 8.96L6.4 8.96Z"/></svg><code>triangleDown</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M60.16 32L8.96 57.6L8.96 6.4Z"/></svg><code>triangleRight</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M3.84 32L55.04 57.6L55.04 6.4Z"/></svg><code>triangleLeft</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16.18 6.4L32 6.4L32 57.6L32 6.4L47.82 6.4L16.18 6.4"/></svg><code>tShapeTop</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16.18 57.6L32 57.6L32 6.4L32 57.6L47.82 57.6L16.18 57.6"/></svg><code>tShapeBottom</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6.4 16.18L6.4 32L57.6 32L6.4 32L6.4 47.82L6.4 16.18"/></svg><code>tShapeLeft</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M57.6 16.18L57.6 32L6.4 32L57.6 32L57.6 47.82L57.6 16.18"/></svg><code>tShapeRight</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M11.52 11.52L52.48 52.48M11.52 52.48L52.48 11.52"/></svg><code>cross</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6.4 32L57.6 32M32 6.4L32 57.6"/></svg><code>plus</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6.4 32L57.6 32M16.61 16.61L47.39 47.39M32 6.4L32 57.6M47.39 16.61L16.61 47.39"/></svg><code>asterisk</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M57.6 32A25.6 25.6 0 1 1 6.4 32A25.6 25.6 0 1 1 57.6 32Z"/></svg><code>circle</code></span>
<span><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M42.24 32A10.24 10.24 0 1 1 21.76 32A10.24 10.24 0 1 1 42.24 32Z"/></svg><code>point</code></span>
</div>

A gene that has no entry in the colour scheme is drawn with `DEFAULT_GENE_STYLE`, set in
`src/glyphs/glyphConfig.js` in the source: a white circle.

## Class colours

A list of class names and colours, in the same format as the viewer's built-in schemes:

```json
[
  { "className": "016 CA1-ProS Glut", "colour": "#28A745" },
  { "className": "025 CA2-FC-IG Glut", "colour": "#A4C400" },
  { "className": "017 CA3 Glut",      "colour": "#2BAF8A" },
  { "className": "*",                 "colour": "#C0C0C0" }
]
```

Names must match the classes of the run; unmatched entries are ignored and listed in the developer console.
Classes not listed in the file keep their current colour. The name `*` sets the colour of
every class that has no entry, in the file or in the built-in scheme; without it, such a
class is drawn with `DEFAULT_CLASS_COLOUR`, set in `config/colorSchemes.js` in the source:
grey.

The schemes in `config/colorSchemes/` in the source (`hippocampus.js`, `zeisel.js` and
`allen.js`) can serve as templates for a new file.
