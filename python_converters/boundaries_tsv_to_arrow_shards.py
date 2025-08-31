#!/usr/bin/env python3
"""
Convert per-plane cell boundary TSVs into Apache Arrow (Feather v2) shards
with a flat polyline representation suitable for fast browser decoding.

Input (default): ./data/cellBoundaries/new_segmentation/plane_*.tsv
Output directory: ./data/arrow_boundaries/

Each input TSV is expected to have columns:
  plane_id (int), label (int/str), coords (JSON string of [[x,y], ...])

We produce one row per polygon with variable-length list columns:
  - x_list (list<float32>): X coordinates of polygon vertices
  - y_list (list<float32>): Y coordinates of polygon vertices
  - plane_id (uint16): plane id per polygon
  - label (int32): polygon label/id per polygon

Sharding: one Feather file per plane (mirrors input plane_XX.tsv). Manifest lists
each plane file with its plane_id and polygon count. Use uncompressed by default
for Arrow JS compatibility.
"""
import argparse
import json
from pathlib import Path
from typing import List, Tuple

import pandas as pd
import pyarrow as pa
import pyarrow.feather as feather


def build_argparser():
    p = argparse.ArgumentParser(description="Boundary TSVs -> Arrow shards (Feather v2)")
    p.add_argument("--indir", default="./data/cellBoundaries/new_segmentation", help="Directory with plane_*.tsv files")
    p.add_argument("--pattern", default="plane_*.tsv", help="Glob pattern for input files inside indir")
    p.add_argument("--outdir", default="./data/arrow_boundaries", help="Output directory for Arrow shards")
    # deprecated: kept for CLI compatibility, no effect when writing per-plane files
    p.add_argument("--polys-per-shard", type=int, default=50_000, help="[deprecated] ignored; one file per plane")
    p.add_argument(
        "--compression",
        default="uncompressed",
        choices=["uncompressed", "none", "zstd", "lz4"],
        help="Feather v2 compression. Use uncompressed/none for best browser support."
    )
    return p


def ensure_outdir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def parse_coords(cell: str) -> List[Tuple[float, float]]:
    """Parse a JSON-like coords string '[[x,y], ...]' into a list of (x,y)."""
    if pd.isna(cell):
        return []
    try:
        arr = json.loads(cell)
        # Expect list of [x, y]
        out: List[Tuple[float, float]] = []
        for pair in arr:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                continue
            x, y = pair
            out.append((float(x), float(y)))
        return out
    except Exception:
        return []


def write_shard(outdir: Path,
                shard_index: int,
                x_lists: List[List[float]],
                y_lists: List[List[float]],
                plane_ids: List[int],
                labels: List[int],
                compression):
    arrays = {
        "x_list": pa.array(x_lists, type=pa.list_(pa.float32())),
        "y_list": pa.array(y_lists, type=pa.list_(pa.float32())),
        "plane_id": pa.array(pd.Series(plane_ids, dtype="uint16")),
        "label": pa.array(pd.Series(labels, dtype="int32")),
    }
    table = pa.table(arrays)
    shard_name = f"boundaries_shard_{shard_index:03d}.feather"
    feather.write_feather(table, (outdir / shard_name).as_posix(), compression=compression)
    # Count total points for logging
    n_polys = len(x_lists)
    n_points = sum(len(xs) for xs in x_lists)
    print(f"Wrote {shard_name}: polys={n_polys}, points={n_points}")
    return shard_name, n_polys, n_points



def main():
    args = build_argparser().parse_args()
    indir = Path(args.indir)
    outdir = Path(args.outdir)
    ensure_outdir(outdir)

    comp = args.compression
    if comp == "none":
        comp = None

    # Collect and sort input files by plane index if possible
    files = sorted(indir.glob(args.pattern))
    if not files:
        raise SystemExit(f"No files matched {indir}/{args.pattern}")

    shards = []
    total_polys = 0
    total_points = 0

    for path in files:
        # Read the plane TSV; small enough to read in one go
        df = pd.read_csv(path, sep="\t", dtype={"plane_id": "Int64", "label": "Int64", "coords": "string"})
        
        x_lists: List[List[float]] = []
        y_lists: List[List[float]] = []
        plane_ids: List[int] = []
        labels: List[int] = []

        for _, row in df.iterrows():
            pid = int(pd.to_numeric(row["plane_id"], errors="coerce"))
            lab = int(pd.to_numeric(row["label"], errors="coerce")) 
            coords = parse_coords(row["coords"])
            if not coords:
                continue
            xs = [float(x) for x, _ in coords]
            ys = [float(y) for _, y in coords]
            if not xs:
                continue
            x_lists.append(xs)
            y_lists.append(ys)
            plane_ids.append(pid)
            labels.append(lab)

        # Write one feather per plane file
        plane_suffix = f"{plane_ids[0]:02d}" if plane_ids else "00"
        arrays = {
            "x_list": pa.array(x_lists, type=pa.list_(pa.float32())),
            "y_list": pa.array(y_lists, type=pa.list_(pa.float32())),
            "plane_id": pa.array(pd.Series(plane_ids, dtype="uint16")),
            "label": pa.array(pd.Series(labels, dtype="int32")),
        }
        table = pa.table(arrays)
        shard_name = f"boundaries_plane_{plane_suffix}.feather"
        feather.write_feather(table, (outdir / shard_name).as_posix(), compression=comp)
        polys = len(x_lists)
        pts = sum(len(xs) for xs in x_lists)
        total_polys += polys
        total_points += pts
        shards.append({"url": shard_name, "rows": int(polys), "plane": int(plane_ids[0] if plane_ids else -1)})
        print(f"Wrote {shard_name}: polys={polys}, points={pts}")

    # Manifest
    manifest = {
        "format": "arrow-feather",
        "total_rows": int(total_polys),  # polygons count
        "total_points": int(total_points),
        "shards": shards,
    }
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Done. Total polys: {total_polys}. Total points: {total_points}. Files: {len(shards)}. Output: {outdir}")


if __name__ == "__main__":
    main()
