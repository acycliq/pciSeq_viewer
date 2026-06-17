---
sidebar_position: 4
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

:::info[TODO]

TODO: document the supported glibc baseline and the .deb fallback.

:::

```bash
chmod +x pciSeq_viewer-x.x.x.AppImage
./pciSeq_viewer-x.x.x.AppImage
```

If it still won't run, install the `.deb` package instead.

## No background image appears

When you open a dataset the viewer auto-discovers the first `.mbtiles` file in
the folder (`stage_image()` writes `output.mbtiles`) and uses it for both the
background tiles and the image dimensions. If no `.mbtiles` file is present, the
viewer prompts you to enter the image **Width**, **Height**, and **Plane count**
manually, spots, cells, and boundaries still render, just without a background
image.

See [Loading Data](/docs/loading-data) for details.

## Arrow files from an older pciSeq

Results from pciSeq `0.0.65` are compatible with the viewer. For
`stage_image()` (background tiles) you need a newer pciSeq, see
[Preparing Your Data](/docs/preparing-data#requirements).
