# pciSeq Viewer

A desktop application for visualizing spatial transcriptomics data from pciSeq analysis.

## Installation

### Linux (Ubuntu/Debian)

1. Download `pciSeq_viewer_X.X.X_amd64.deb` from [Releases](https://github.com/acycliq/pciSeq_viewer/releases/latest)
2. Install:
   ```bash
   sudo apt install ./pciSeq_viewer_*.deb
   ```
   Or if reinstalling/upgrading:
   ```bash
   sudo apt install --reinstall ./pciSeq_viewer_*.deb
   ```
3. Launch from your applications menu or run `pciSeq_viewer` in terminal

---

## Preparing Your Data

Before using the viewer, you need to prepare your data using Python. This involves two steps:

1. **Run pciSeq analysis** - generates cell typing results (Arrow files)
2. **Create background tiles** - converts your microscopy image to viewable format (MBTiles)

### Requirements

Install the pciSeq Python package (version > 0.0.65 required):

```bash
pip install git+https://github.com/acycliq/pciSeq.git@dev_3d
```

For background image processing, you also need libvips:

```bash
# Ubuntu/Debian
sudo apt install libvips
```

---

### Step 1: Run pciSeq Analysis

This step performs cell typing and generates the data files needed by the viewer.

```python
import pciSeq

# Your input data
spots = ...       # DataFrame with columns: x, y, z_plane, gene_name
coo = ...         # List of sparse matrices (cell segmentation masks)
scRNAseq = ...    # Single-cell reference data

# Run the analysis
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

# Create the MBTiles file
pciSeq.stage_image(
    img=dapi_image,
    out_dir='/path/to/my_dataset/pciSeq/data',  # Same folder as Arrow files
    zoom_levels=8,
    name='My Dataset',                           # Short identifier
    description='DAPI staining, mouse cortex',   # Detailed description
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
        ├── output.mbtiles           # Background image tiles
        └── arrow/
            ├── arrow_spots/         # Gene spots
            │   ├── manifest.json
            │   ├── gene_dict.json
            │   └── spots_shard_*.feather
            ├── arrow_cells/         # Cell data
            │   ├── manifest.json
            │   └── cells_shard_*.feather
            └── arrow_boundaries/    # Cell boundaries
                ├── manifest.json
                └── boundaries_plane_*.feather
```

---

## Loading Data in the Viewer

1. **Launch the application**

2. **Select your data folder**
   - Go to `File > Open Data Folder`
   - Navigate to your data folder (e.g., `/path/to/my_dataset/pciSeq/data`)
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

## Troubleshooting

### "Missing required metadata" error

Your MBTiles file is missing image dimensions. Re-run `pciSeq.stage_image()` to regenerate the file.

### Background image doesn't appear

- Check that `output.mbtiles` exists in your data folder
- Ensure the MBTiles file was created with the correct `zoom_levels` (default: 8)

### libvips not found

Install libvips before running `stage_image()`:

```bash
# Ubuntu/Debian
sudo apt install libvips

# Then reinstall pyvips
pip install --force-reinstall pyvips
```

---

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


output_folder = '/home/user/my_experiment'

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
    out_dir=f'{output_folder}/pciSeq/data',
    name='WT Mouse', # short description, identifier
    description='Mouse cortex, 102 z-planes', # long description
)
# Note: Note: if out_dir is not set, the output.mbtiles file is created in the system temp directory (/tmp on Linux)

print(f'Done! Open this folder in the viewer: {output_folder}/pciSeq/data')
```
