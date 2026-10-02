# Allen whole mouse brain taxonomy (for the chat's allen_cell_type tool)

Three files from the Allen Brain Cell Atlas, unchanged, and two summaries of
bigger ones (below):

- `cluster_annotation_term_with_counts.csv`
- `cluster_to_cluster_annotation_membership_pivoted.csv`
- `cluster_annotation_term_set.csv`

Source: the public bucket `allen-brain-cell-atlas`, `metadata/WMB-taxonomy/20231215/`
(the first two under `views/`), taxonomy CCN20230722. Downloaded 2026-10-02.

They are the Allen Institute's, used and redistributed here for research and
noncommercial purposes under the Allen Institute Terms of Use
(https://alleninstitute.org/legal/terms-use/). Selling the viewer, or a paid service
built on it, would need the Allen Institute's written permission. Cite per the Allen
Institute citation policy (https://alleninstitute.org/citation-policy/) and the
taxonomy paper: Yao et al. 2023, "A high-resolution transcriptomic and spatial atlas
of cell types in the whole mouse brain", Nature 624, 317-332.

To update: download the same three files from a newer release and replace these.

## markers.csv and regions.csv

Our own summaries of three bigger Allen files (about 3 GB), made by
`build_summaries.py`; the file's docstring says what each column is. Inputs, from
the same bucket, downloaded 2026-10-02:

- `mapmycells/WMB-taxonomy/20240831/precomputed_stats_ABC_revision_230821.h5`
- `metadata/WMB-10X/20241115/gene.csv`
- `metadata/MERFISH-C57BL6J-638850-CCF/20231215/views/cell_metadata_with_parcellation_annotation.csv`

To update: download newer copies and run, inside this folder,
`python build_summaries.py STATS_H5 GENE_CSV MERFISH_CSV`.
