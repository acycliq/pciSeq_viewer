"""Builds markers.csv and regions.csv in this folder from two big Allen Brain Cell
Atlas files, so the viewer ships a few MB instead of ~3 GB. Run it again to update.

    python build_summaries.py STATS_H5 GENE_CSV MERFISH_CSV

STATS_H5     precomputed_stats_ABC_revision_230821.h5 (WMB-taxonomy, MapMyCells):
             per cluster, the mean log2(CPM+1) of every gene (its n_cells is 1
             everywhere, so 'sum' is already the mean)
GENE_CSV     WMB-10X gene.csv, Ensembl id to gene symbol
MERFISH_CSV  cell_metadata_with_parcellation_annotation.csv (MERFISH-C57BL6J-638850-CCF):
             every MERFISH cell with its type at each level and its CCF region

markers.csv: per type, the genes most specific to it. For a type T at some level,
    mean_in   = mean log2(CPM+1) over T's cells (cluster means weighted by the
                number of cells in each cluster, from the terms file here),
    mean_out  = the same over all other cells,
    log2_fold = mean_in - mean_out.
    Kept: mean_in >= 1 and log2_fold > 0, best first, 300 genes per class and
    subclass, 100 per supertype; clusters are left out to keep the file small.
regions.csv: per type, the share of its MERFISH cells in each CCF division and
    structure, regions holding at least 1% of the type, at most 10 per level;
    clusters left out as for the markers.
"""
import json
import sys

import h5py
import numpy as np
import pandas as pd

LEVELS = ['class', 'subclass', 'supertype', 'cluster']
MARKERS_KEPT = {'class': 300, 'subclass': 300, 'supertype': 100}
MIN_MEAN_IN = 1.0
REGION_MIN_SHARE = 0.01
REGIONS_KEPT = 10


def cluster_levels():
    """per cluster: its label, its number of cells and its class, subclass and
    supertype, from the files in this folder, which list every cluster"""
    piv = pd.read_csv('cluster_to_cluster_annotation_membership_pivoted.csv', dtype=str)
    terms = pd.read_csv('cluster_annotation_term_with_counts.csv')
    terms = terms[terms['cluster_annotation_term_set_name'] == 'cluster'].set_index('name')
    piv['label'] = piv['cluster'].map(terms['label'])
    piv['cells'] = piv['cluster'].map(terms['number_of_cells']).astype(np.float64)
    return piv


def markers(stats_h5, gene_csv, clusters):
    with h5py.File(stats_h5, 'r') as h:
        genes = json.loads(h['col_names'][()].decode())
        row_of = json.loads(h['cluster_to_row'][()].decode())
        means = h['sum'][()].astype(np.float32)
    symbol = pd.read_csv(gene_csv).set_index('gene_identifier')['gene_symbol']
    names = [symbol.get(g, g) for g in genes]
    clusters = clusters[clusters['label'].isin(row_of)]
    rows_all = clusters['label'].map(row_of).to_numpy()
    w_all = clusters['cells'].to_numpy()
    N, S = w_all.sum(), np.einsum('c,cg->g', w_all, means[rows_all], dtype=np.float64)
    out = []
    for level, kept in MARKERS_KEPT.items():
        for term, grp in clusters.groupby(level):
            rows, w = grp['label'].map(row_of).to_numpy(), grp['cells'].to_numpy()
            nt = w.sum()
            if nt == 0 or N - nt == 0:
                continue
            st = np.einsum('c,cg->g', w, means[rows], dtype=np.float64)
            mean_in, mean_out = st / nt, (S - st) / (N - nt)
            fold = mean_in - mean_out
            ok = np.where((mean_in >= MIN_MEAN_IN) & (fold > 0))[0]
            for g in ok[np.argsort(-fold[ok])][:kept]:
                out.append((term, level, names[g], round(fold[g], 2), round(mean_in[g], 2), round(mean_out[g], 2)))
    return pd.DataFrame(out, columns=['name', 'level', 'gene', 'log2_fold', 'mean_in', 'mean_out'])


def regions(merfish):
    out = []
    for level in MARKERS_KEPT:
        for region_level in ['parcellation_division', 'parcellation_structure']:
            counts = merfish.groupby([level, region_level]).size().rename('cells').reset_index()
            counts['share'] = counts['cells'] / counts.groupby(level)['cells'].transform('sum')
            counts = counts[counts['share'] >= REGION_MIN_SHARE]
            counts = counts.sort_values([level, 'share'], ascending=[True, False]).groupby(level).head(REGIONS_KEPT)
            for r in counts.itertuples(index=False):
                out.append((r[0], level, region_level.split('_')[1], r[1], int(r.cells), round(r.share, 3)))
    return pd.DataFrame(out, columns=['name', 'level', 'region_level', 'region', 'cells', 'share'])


if __name__ == '__main__':
    stats_h5, gene_csv, merfish_csv = sys.argv[1:4]
    merfish = pd.read_csv(merfish_csv, usecols=LEVELS + ['parcellation_division', 'parcellation_structure'],
                          dtype=str).dropna()
    markers(stats_h5, gene_csv, cluster_levels()).to_csv('markers.csv', index=False)
    regions(merfish).to_csv('regions.csv', index=False)
    print('wrote markers.csv and regions.csv')
