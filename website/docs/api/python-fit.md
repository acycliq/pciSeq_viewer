---
sidebar_position: 1
title: pciSeq.fit()
description: API reference for the cell typing engine.
---

# pciSeq.fit()

The primary entry point for the pciSeq pipeline. This function performs cell typing on spatial transcriptomics data and, if configured, saves the results in the Arrow format required by the viewer.

```python
pciSeq.fit(spots, coo, scRNAseq, opts=None)
```

## Parameters

### `spots` 
**Type:** `pandas.DataFrame`  
A DataFrame containing the detected gene spots. Required columns:
- `x`, `y`: Spatial coordinates (pixels).
- `z_plane`: The integer plane index (0-based).
- `gene_name`: The gene identity of the spot.

### `coo`
**Type:** `list` of `scipy.sparse.coo_matrix`  
A list where each element is a sparse matrix representing the cell segmentation masks for a single z-plane. The length of the list must match the number of planes in the dataset.

### `scRNAseq`
**Type:** `pandas.DataFrame`  
The single-cell RNA-seq reference data used to guide the cell typing. Typically a gene-by-cell-type matrix.

### `opts` (optional)
**Type:** `dict`  
Configuration options for the fit. To generate data for the viewer, the following keys are essential:

| Key | Type | Default | Description |
|---|---|---|---|
| `save_data` | `bool` | `False` | Must be `True` to write the Arrow files. |
| `output_path` | `str` | `tempdir` | The root folder where results will be written. |
| `max_iter` | `int` | `200` | Maximum number of EM iterations. |
| `p_outlier` | `float` | `0.01` | Probability that a spot is an outlier. |

## Returns

Returns a tuple `(cells, spots)` containing the inferred cell-type probabilities and spot assignments, respectively.

## Example

```python
import pciSeq

cells, spots = pciSeq.fit(
    spots=my_spots_df,
    coo=my_masks_list,
    scRNAseq=reference_df,
    opts={
        'save_data': True,
        'output_path': './results'
    }
)
```
