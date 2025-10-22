https://acycliq.github.io/pciSeq_viewer/

[//]: # ()
[//]: # ()
[//]: # ()
[//]: # (# Counts per Class)

[//]: # ()
[//]: # ([View interactive charts]&#40;https://acycliq.github.io/deckgl_viewer/counts_per_class.html&#41;)
[//]: # ()
[//]: # (---)

## Setting Up Your Own Data

### Prerequisites

1. Run pciSeq analysis on your dataset to generate Arrow files
2. A local web server to serve the viewer (e.g., Python's `http.server`)

### Step 1: Run pciSeq

Run function `pciSeq.fit()` with `save_data=True`:

```python
import pciSeq

opts = {
    'save_data': True,
    'output_path': '/path/to/output',  # Optional: defaults to system temp dir
    # ... other options
}

pciSeq.fit(spots=spots_df, coo=coo_matrices, scRNAseq=scrna_df, opts=opts)
```

This generates Arrow files in: `/path/to/output/pciSeq/data/arrow/`

**Note:** If `output_path` is not specified, pciSeq saves to the system temp directory:
- Linux: `/tmp/pciSeq/data/arrow/`
- macOS: `/tmp/pciSeq/data/arrow/`
- Windows: `%TEMP%\pciSeq\data\arrow\`

### Step 2: Copy Arrow Files to Viewer

Copy the generated Arrow directories to your viewer's data folder:

```bash
cp -r /path/to/output/pciSeq/data/arrow/arrow_spots ./data/
cp -r /path/to/output/pciSeq/data/arrow/arrow_cells ./data/
cp -r /path/to/output/pciSeq/data/arrow/arrow_boundaries ./data/
```

Your data structure should look like:
```
deckgl_viewer/
├── data/
│   ├── arrow_spots/
│   │   ├── manifest.json
│   │   ├── gene_dict.json
│   │   └── spots_shard_*.feather
│   ├── arrow_cells/
│   │   ├── manifest.json
│   │   └── cells_shard_*.feather
│   └── arrow_boundaries/
│       ├── manifest.json
│       └── boundaries_plane_*.feather
```

### Step 3: Update config.js

Edit `config.js` to point to your Arrow files:

```javascript
function config() {
    return {
        totalPlanes: 102,           // Update to match your dataset
        startingPlane: 50,          // Middle plane
        imageWidth: 6411,           // Your image dimensions
        imageHeight: 4412,

        // Point to your Arrow manifests
        arrowSpotsManifest: "./data/arrow_spots/manifest.json",
        arrowCellsManifest: "./data/arrow_cells/manifest.json",
        arrowBoundariesManifest: "./data/arrow_boundaries/manifest.json",
        arrowSpotsGeneDict: "./data/arrow_spots/gene_dict.json",

        // Optional: background tiles
        backgroundTiles: "path/to/tiles/{plane}/{z}/{y}/{x}.jpg",
    };
}
```

### Step 4: Launch Viewer

Start a local web server:

```bash
# Python 3
python -m http.server 8000

# Or use any other local server
```

Open browser to: `http://localhost:8000`

