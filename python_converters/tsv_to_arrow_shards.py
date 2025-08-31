#!/usr/bin/env python3
"""
Convert a large TSV of spots (geneData.tsv) into Apache Arrow (Feather v2) shards
plus a minimal manifest for browser loading.

Input (default): ./data/newSpots_newSegmentation/geneData.tsv
Output directory: ./data/arrow_spots/

Columns expected (subset is OK):
  gene_name (str), x (float), y (float), z (float), plane_id (int), spot_id (str/int), parent_cell_id (int)
  neighbour_array (JSON list<int>), neighbour_prob (JSON list<float>), omp_score (float), omp_intensity (float)

We dictionary-encode gene_name to numeric gene_id and write both gene_id and gene_name
into the Arrow shards. Shards are ~200k rows by default and compressed with zstd.

Manifest produced: manifest.json with list of shard files and row counts.
Gene dictionary produced: gene_dict.json mapping gene_id -> gene_name.

Usage:
  python3 python_converters/tsv_to_arrow_shards.py \
      --input ./data/newSpots_newSegmentation/geneData.tsv \
      --outdir ./data/arrow_spots \
      --rows-per-shard 200000
"""
import argparse
import json
import os
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.feather as feather
import json as _json


def build_argparser():
    p = argparse.ArgumentParser(description="TSV -> Arrow shards (Feather v2)")
    p.add_argument("--input", default="./data/newSpots_newSegmentation/geneData.tsv")
    p.add_argument("--outdir", default="./data/arrow_spots")
    p.add_argument("--rows-per-shard", type=int, default=200_000)
    p.add_argument(
        "--compression",
        default="uncompressed",
        choices=["uncompressed", "none", "zstd", "lz4"],
        help="Record batch compression for Feather v2. Browser Arrow JS often cannot decode zstd/lz4; use uncompressed/none for web demos."
    )
    return p


def ensure_outdir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def _parse_int_list(cell: str):
    if pd.isna(cell):
        return None
    try:
        v = _json.loads(cell)
        if isinstance(v, list):
            out = []
            for x in v:
                try:
                    out.append(int(x))
                except Exception:
                    continue
            return out
    except Exception:
        return None
    return None


def _parse_float_list(cell: str):
    if pd.isna(cell):
        return None
    try:
        v = _json.loads(cell)
        if isinstance(v, list):
            out = []
            for x in v:
                try:
                    out.append(float(x))
                except Exception:
                    continue
            return out
    except Exception:
        return None
    return None


def infer_and_cast(df: pd.DataFrame) -> pd.DataFrame:
    # Select and cast a minimal set of columns; keep optional ones if present
    cols = {}
    if "x" in df.columns: cols["x"] = df["x"].astype("float32")
    if "y" in df.columns: cols["y"] = df["y"].astype("float32")
    if "z" in df.columns: cols["z"] = df["z"].astype("float32")
    if "plane_id" in df.columns: cols["plane_id"] = df["plane_id"].astype("uint16", errors="ignore")
    if "spot_id" in df.columns:
        cols["spot_id"] = pd.to_numeric(df["spot_id"], errors="coerce").astype("uint32")
    if "parent_cell_id" in df.columns:
        cols["parent_cell_id"] = pd.to_numeric(df["parent_cell_id"], errors="coerce").fillna(-1).astype("int32")
    if "gene_id" in df.columns:
        cols["gene_id"] = pd.to_numeric(df["gene_id"], errors="coerce").astype("uint32")
    # Note: gene_name removed from Arrow output - use gene_dict.json lookup with gene_id instead

    # Optional neighbour/omp fields
    if "neighbour_array" in df.columns:
        cols["neighbour_array"] = df["neighbour_array"].apply(_parse_int_list)
    if "neighbour_prob" in df.columns:
        cols["neighbour_prob"] = df["neighbour_prob"].apply(_parse_float_list)
    if "omp_score" in df.columns:
        cols["omp_score"] = pd.to_numeric(df["omp_score"], errors="coerce").astype("float32")
    if "omp_intensity" in df.columns:
        cols["omp_intensity"] = pd.to_numeric(df["omp_intensity"], errors="coerce").astype("float32")

    return pd.DataFrame(cols)


def main():
    args = build_argparser().parse_args()
    inp = Path(args.input)
    outdir = Path(args.outdir)
    ensure_outdir(outdir)

    shards = []
    total_rows = 0
    shard_index = 0
    gene_dict_data = None  # Will store gene_id -> gene_name mapping

    # Read TSV in chunks to avoid high memory usage
    reader = pd.read_csv(inp, sep="\t", dtype="string", chunksize=args.rows_per_shard)

    # Map CLI compression to pyarrow parameter
    comp = args.compression
    if comp == "none":
        comp = None

    for chunk in reader:
        # Accumulate gene dictionary from all chunks
        if "gene_id" in chunk.columns and "gene_name" in chunk.columns:
            if gene_dict_data is None:
                gene_dict_data = {}
            
            # Add genes from this chunk
            chunk_gene_dict = dict(zip(pd.to_numeric(chunk["gene_id"], errors="coerce").fillna(0).astype(int), 
                                     chunk["gene_name"].fillna("")))
            gene_dict_data.update(chunk_gene_dict)

        df = infer_and_cast(chunk)

        # Arrow schema with explicit types
        arrays = {}
        for col in df.columns:
            # Convert pandas string dtype to pyarrow string, numeric to matching pa types
            if col in ("neighbour_array", "neighbour_prob"):
                # Build list arrays explicitly
                if col == "neighbour_array":
                    arrays[col] = pa.array(df[col].tolist(), type=pa.list_(pa.int32()))
                else:
                    arrays[col] = pa.array(df[col].tolist(), type=pa.list_(pa.float32()))
            elif pd.api.types.is_string_dtype(df[col]):
                arrays[col] = pa.array(df[col].astype("string"))
            elif pd.api.types.is_float_dtype(df[col]):
                arrays[col] = pa.array(df[col].astype("float32"))
            elif pd.api.types.is_integer_dtype(df[col]):
                # Use the smallest arrow type compatible with pandas dtype
                if str(df[col].dtype).startswith("uint16"):
                    arrays[col] = pa.array(df[col].astype("uint16"))
                elif str(df[col].dtype).startswith("uint32"):
                    arrays[col] = pa.array(df[col].astype("uint32"))
                elif str(df[col].dtype).startswith("int32"):
                    arrays[col] = pa.array(df[col].astype("int32"))
                else:
                    arrays[col] = pa.array(df[col].astype("int64"))
            else:
                arrays[col] = pa.array(df[col])

        table = pa.table(arrays)
        shard_name = f"spots_shard_{shard_index:03d}.feather"
        shard_path = outdir / shard_name
        feather.write_feather(table, shard_path.as_posix(), compression=comp)

        row_count = len(df)
        shards.append({"url": shard_name, "rows": int(row_count)})
        total_rows += row_count
        shard_index += 1
        print(f"Wrote {shard_name} with {row_count} rows")

    # Write manifest
    manifest = {
        "format": "arrow-feather",
        "total_rows": int(total_rows),
        "shards": shards,
    }
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    # Write gene dictionary (id -> name) - sort by key and deduplicate
    if gene_dict_data:
        # Sort by gene_id and ensure unique mappings
        sorted_gene_dict = dict(sorted(gene_dict_data.items()))
        (outdir / "gene_dict.json").write_text(json.dumps(sorted_gene_dict, indent=2))
        print(f"Gene dictionary: {len(sorted_gene_dict)} unique genes")

    print(f"Done. Total rows: {total_rows}. Shards: {len(shards)}. Output dir: {outdir}")


if __name__ == "__main__":
    main()
