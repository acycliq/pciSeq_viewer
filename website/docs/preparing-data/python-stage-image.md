---
title: pciSeq.stage_image()
description: The pciSeq function that generates the viewer's background tiles.
---

# pciSeq.stage_image()

::: info Part of the pciSeq package
`pciSeq.stage_image()` lives in the [pciSeq](https://github.com/acycliq/pciSeq)
Python package, not the viewer. It is documented here because it is how you
produce the background tiles the viewer reads. See
[`stage_image`](https://acycliq.github.io/pciSeq_3d/api/reference#stage-image)
in the pciSeq API reference for the canonical signature.
:::

Converts a microscopy image (or z-stack) into a multi-plane **MBTiles** file. The viewer uses these tiles to provide a high-performance slippy map background.

```python
pciSeq.stage_image(img, out_dir=None, name=None, description=None, tint=None)
```

Advanced arguments (rarely needed): `zoom_levels=8`, `plane_prefix="plane_"`, `use_buffer=True`.

## Parameters

### `img`
**Type:** `numpy.ndarray`  
The image data to be tiled. Supported shapes:
- `(Z, H, W)`: For a 3D z-stack.
- `(H, W)`: For a 2D image.

### `out_dir` (optional)
**Type:** `str`  
The directory where the `.mbtiles` file will be saved. Usually this is the `viewer_data` folder. If omitted, the file is written to a system temp directory.

### `name` (optional)
**Type:** `str`  
The name of the image channel (e.g., "DAPI", "GCaMP"). Shown as the channel label in the viewer, and also used as the output filename (`name='dapi'` writes `dapi.mbtiles`; if empty, the file is `output.mbtiles`).

### `description` (optional)
**Type:** `str`  
A brief description of the channel, stored in the MBTiles metadata.

### `tint` (optional)
**Type:** `str`  
A hex color code (e.g., `'#00FF00'`). If provided, the grayscale tiles will be tinted with this color in the viewer. Useful for overlaying multiple fluorescent channels.

## Requirements

This function requires **libvips** for image tiling. pciSeq declares `pyvips[binary]`
as a dependency, so `pip install pciSeq` automatically installs the `pyvips` wheel with
a prebuilt libvips binary bundled in. No separate libvips installation is required.

If a prebuilt binary is unavailable for your platform, install libvips manually:

```bash
# macOS
brew install vips

# Ubuntu
sudo apt install libvips
```

## Example

```python
import pciSeq
import numpy as np

# Load a DAPI z-stack
dapi = np.load('dapi_stack.npy')

# Stage it for the viewer
pciSeq.stage_image(
    img=dapi,
    out_dir='./viewer_data',
    name='DAPI',
    tint='#4080FF'
)
```
