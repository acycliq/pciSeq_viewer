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
import re
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


def main():
    args = build_argparser().parse_args()
    indir = Path(args.indir)
    outdir = Path(args.outdir)
    ensure_outdir(outdir)

    comp = args.compression
    if comp == "none":
        comp = None

    files = sorted(indir.glob(args.pattern))
    if not files:
        raise SystemExit(f"No files matched {indir}/{args.pattern}")

    shards = []
    total_polys = 0
    total_points = 0

    # Define the schema once, to be used for all files
    schema = pa.schema([
        pa.field('x_list', pa.list_(pa.float32())),
        pa.field('y_list', pa.list_(pa.float32())),
        pa.field('plane_id', pa.uint16()),
        pa.field('label', pa.int32())
    ])

    for path in files:
        # Extract plane_id from filename, e.g., plane_42.tsv -> 42
        match = re.search(r"(\d+)", path.name)
        if not match:
            print(f"Warning: could not parse plane ID from filename, skipping: {path.name}")
            continue

        current_plane_id = int(match.group(1))
        shard_name = f"boundaries_plane_{current_plane_id:02d}.feather"

        df = pd.read_csv(path, sep="\t", dtype={"label": "Int64", "coords": "string"})

        # Use .apply for efficient parsing, drop rows where parsing fails
        df["parsed_coords"] = df["coords"].apply(parse_coords)
        df = df[df["parsed_coords"].str.len() > 0]

        if df.empty:
            # If file is empty or has no valid polygons, write an empty Feather file
            # with the correct schema.
            empty_table = schema.empty_table()
            feather.write_feather(empty_table, (outdir / shard_name).as_posix(), compression=comp)
            shards.append({"url": shard_name, "rows": 0, "plane": current_plane_id})
            print(f"Wrote empty shard {shard_name} for plane {current_plane_id}")
            continue

        # Prepare data for Arrow
        x_lists = df["parsed_coords"].apply(lambda coords: [float(x) for x, _ in coords])
        y_lists = df["parsed_coords"].apply(lambda coords: [float(y) for _, y in coords])
        labels = pd.to_numeric(df["label"], errors="coerce").fillna(-1).astype("int32")

        # Create the Arrow table
        arrays = {
            "x_list": pa.array(x_lists, type=pa.list_(pa.float32())),
            "y_list": pa.array(y_lists, type=pa.list_(pa.float32())),
            "plane_id": pa.array([current_plane_id] * len(df), type=pa.uint16()),
            "label": pa.array(labels, type=pa.int32()),
        }
        table = pa.table(arrays, schema=schema)

        # Write the Feather file
        feather.write_feather(table, (outdir / shard_name).as_posix(), compression=comp)

        polys = len(df)
        pts = sum(x_lists.str.len())
        total_polys += polys
        total_points += pts

        shards.append({"url": shard_name, "rows": int(polys), "plane": current_plane_id})
        print(f"Wrote {shard_name}: polys={polys}, points={pts}")

    # Manifest
    manifest = {
        "format": "arrow-feather",
        "total_rows": int(total_polys),
        "total_points": int(total_points),
        "shards": shards,
    }
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Done. Total polys: {total_polys}. Total points: {total_points}. Files: {len(shards)}. Output: {outdir}")


if __name__ == "__main__":
    main()
