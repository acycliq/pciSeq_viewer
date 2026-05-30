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

The viewer expects `output.mbtiles` in the data folder. If you don't have one,
provide image dimensions manually with an `image_dims.json` file next to your
data folders:

```json
{ "width": 6411, "height": 4412, "plane_count": 102 }
```

See [Loading Data](/loading-data) for details.

## Arrow files from an older pciSeq

Results from pciSeq `0.0.65` are compatible with the viewer. For
`stage_image()` (background tiles) you need a newer pciSeq — see
[Preparing Your Data](/preparing-data#requirements).
