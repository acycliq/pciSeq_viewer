# pciSeq Viewer

A desktop application for visualizing spatial transcriptomics data from pciSeq.

![pciSeq Viewer Demo](https://github.com/user-attachments/assets/f67a473a-0f84-48e7-9b4f-27be841778aa)

## Installation

Download the latest release from [GitHub Releases](https://github.com/acycliq/pciSeq_viewer/releases/latest).

### Windows

- **Installer:** `pciSeq_viewer-Setup-x.x.x.exe` - Standard installer
- Run the installer and follow the prompts

### macOS

- **Installer:** `pciSeq_viewer-x.x.x.dmg` - Drag to Applications
- **Portable:** `pciSeq_viewer-x.x.x-mac.zip` - Extract and run

> **Note:** On first launch, macOS may show a security warning. Right-click the app and select "Open" to bypass Gatekeeper.

### Linux (Ubuntu/Debian)

- **Installer:** `pciSeq_viewer_x.x.x_amd64.deb`
  ```bash
  sudo apt install ./pciSeq_viewer_x.x.x_amd64.deb
  ```
- **Portable:** `pciSeq_viewer-x.x.x.AppImage` - Make executable and run
  ```bash
  chmod +x pciSeq_viewer-x.x.x.AppImage
  ./pciSeq_viewer-x.x.x.AppImage
  ```

---

## Preparing Your Data

Before using the viewer, you need to prepare your data using Python. This involves two steps:

1. **Run pciSeq** - generates cell typing results (Arrow files)
2. **Create background tiles** - converts your microscopy image to viewable format (MBTiles)

### Requirements

Install the pciSeq Python package:

```bash
pip install git+https://github.com/acycliq/pciSeq.git@dev_3d
```

> **Note:** If you have already run your cell typing with pciSeq `0.0.65`, your Arrow files are fully compatible with the
> viewer. You can **skip Step 1** and jump straight to [Step 2: Create Background Tiles](#step-2-create-background-tiles-mbtiles).
> However, `stage_image()` was added after `0.0.65`, so you still need to install the latest version for Step 2.

For background image processing, you also need libvips:

```bash
# macOS
brew install vips

# Ubuntu/Debian
sudo apt install libvips
```

---

### Step 1: Run pciSeq

This step performs cell typing and generates the data files needed by the viewer.

```python
import pciSeq

# Your input data
spots = ...       # DataFrame with columns: x, y, z_plane, gene_name
coo = ...         # List of sparse matrices (cell segmentation masks)
scRNAseq = ...    # Single-cell reference data

# celltyping
pciSeq.fit(
    spots=spots,
    coo=coo,
    scRNAseq=scRNAseq,
    opts={
        'save_data': True,
        'output_path': '/path/to/my_dataset',  # Where to save results
    }
)
```

This creates a folder with your results:

```
/path/to/my_dataset/
└── pciSeq/
    └── data/
        └── arrow/
            ├── arrow_spots/       # Gene spot locations
            ├── arrow_cells/       # Cell information
            └── arrow_boundaries/  # Cell boundary polygons
```

---

### Step 2: Create Background Tiles (MBTiles)

Convert your microscopy image (e.g., DAPI) into a format the viewer can display.

```python
import pciSeq
import numpy as np

# Load your background image
# This should be a numpy array with shape (Z, H, W) for 3D data
# or (H, W) for 2D data
dapi_image = np.load('/path/to/dapi_image.npy')

# Create the MBTiles file (requires pciSeq > 0.0.65)
pciSeq.stage_image(
    img=dapi_image,
    out_dir='/path/to/my_dataset/pciSeq/data/arrow',  # Same folder as Arrow files
    name='My Dataset',                                 # Short identifier
    description='DAPI staining, mouse cortex',         # Detailed description
)
```

This creates `output.mbtiles` in the specified directory.

---

### Final Data Structure

After both steps, your data folder should look like this:

```
/path/to/my_dataset/
└── pciSeq/
    └── data/
        └── arrow/
            ├── output.mbtiles       # Background image tiles
            ├── arrow_spots/         # Gene spots
            │   ├── manifest.json
            │   ├── gene_dict.json
            │   └── spots_shard_*.feather
            ├── arrow_cells/         # Cell data
            │   ├── manifest.json
            │   ├── class_dict.json
            │   └── cells_shard_*.feather
            └── arrow_boundaries/    # Cell boundaries
                ├── manifest.json
                └── boundaries_plane_*.feather
```

---

## Loading Data in the Viewer

1. **Launch the application**

2. **Select your data folder**
   - Go to `File > Open Dataset...`
   - Navigate to your arrow folder (e.g., `/path/to/my_dataset/pciSeq/data/arrow`)
   - Click "Select Folder"

3. **Enter voxel size**
   - The app will prompt you to enter the voxel size (microns per pixel)
   - Enter values for X, Y, and Z dimensions (e.g., 0.28, 0.28, 0.7)

4. **The viewer will automatically load:**
   - Background image from `output.mbtiles`
   - Gene spots from `arrow_spots/`
   - Cell boundaries from `arrow_boundaries/`
   - Cell information from `arrow_cells/`

---

<!--
## Troubleshooting

### libvips not found

Install libvips before running `stage_image()`:

```bash
# macOS
brew install vips

# Ubuntu/Debian
sudo apt install libvips

# Then reinstall pyvips
pip install --force-reinstall pyvips
```

### macOS Security Warning

If macOS blocks the app from opening:

1. Right-click (or Control-click) on pciSeq_viewer in Applications
2. Select "Open" from the menu
3. Click "Open" in the security dialog

Or remove the quarantine attribute:
```bash
xattr -cr /Applications/pciSeq_viewer.app
```
-->

## Complete Example

Here's a full workflow from raw data to visualization:

```python
import pciSeq
import pandas as pd
import numpy as np
from scipy.sparse import coo_matrix

# Load your data 
spots = pd.read_csv('spots.csv')           # x, y, z_plane, gene_name
masks = np.load('segmentation.npy')        # (Z, H, W) segmentation masks
coo = [coo_matrix(m) for m in masks]       # Convert to sparse format
scRNAseq = pd.read_csv('reference.csv')    # Single-cell reference
dapi = np.load('dapi.npy')                 # (Z, H, W) background image


output_folder = '/path/to/my_experiment'  # e.g., '/home/user/my_experiment' on Linux, '/Users/user/my_experiment' on macOS

#1. Run pciSeq
pciSeq.fit(
    spots=spots,
    coo=coo,
    scRNAseq=scRNAseq,
    opts={
        'save_data': True,
        'output_path': output_folder,
    }
)

# 2. Create MBTiles
pciSeq.stage_image(
    img=dapi,
    out_dir=f'{output_folder}/pciSeq/data/arrow',
    name='WT Mouse', # short description, identifier
    description='Mouse cortex, 102 z-planes', # long description
)
# Note: if out_dir is not set, output.mbtiles is created in the system temp directory (/tmp on Linux, /var/folders/... on macOS)

print(f'Done! Open this folder in the viewer: {output_folder}/pciSeq/data/arrow')
```
