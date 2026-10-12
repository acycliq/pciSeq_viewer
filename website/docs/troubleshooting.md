---
title: Troubleshooting
description: Fixes for common installation and data-loading issues.
---

# Troubleshooting

## macOS: app won't open

On first launch macOS may block the app because it isn't notarized. Right-click
(or Control-click) the app icon and choose **Open**, then confirm. This only
needs to be done once.

## Linux: AppImage / glibc compatibility

If the AppImage fails to start on older distributions (e.g. Ubuntu 20.04), it is
usually a glibc version mismatch.

```bash
chmod +x pciSeq_viewer-x.x.x.AppImage
./pciSeq_viewer-x.x.x.AppImage
```

If it still won't run, install the `.deb` package instead.

## No background image appears

When you open a dataset the viewer auto-discovers every `.mbtiles` file in the
folder as a switchable background channel (`stage_image()` writes one per channel)
and reads the image dimensions from the first one. If no `.mbtiles` file is
present, the viewer prompts you to enter the image **Width**, **Height**, and
**Plane count** manually. Spots, cells, and boundaries still render, without
a background image.

See [Loading Data](/docs/loading-data) for details.

## Runs from an older pciSeq

Runs made with pciSeq `0.0.65` or older have no diagnostics database and no
`stage_image()`, so the background is missing and the cell and spot inspectors and the AI
agent have nothing to read. Refit with `0.0.66` or newer, see
[Preparing Your Data](/docs/preparing-data#requirements).
