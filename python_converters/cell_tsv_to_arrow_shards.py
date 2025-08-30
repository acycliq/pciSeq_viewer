#!/usr/bin/env python3
"""
Convert cellData.tsv to Apache Arrow (Feather v2) shards + manifest

Input (default): ./data/newSpots_newSegmentation/cellData.tsv
Output directory: ./data/arrow_cells/

Columns expected (subset OK):
  Cell_Num (int), X (float), Y (float), Z (float), ClassName (str), Prob (float/str), gaussian_contour (str)

We dictionary-encode ClassName to class_id, and write both class_id (numeric) and ClassName (string)
into the shards. Default shard size ~100k rows, compression uncompressed for web decoding.
"""
import argparse
import json
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.feather as feather


def build_argparser():
    p = argparse.ArgumentParser(description="cellData.tsv -> Arrow shards (Feather v2)")
    p.add_argument("--input", default="./data/newSpots_newSegmentation/cellData.tsv")
    p.add_argument("--outdir", default="./data/arrow_cells")
    p.add_argument("--rows-per-shard", type=int, default=100_000)
    p.add_argument(
        "--compression",
        default="uncompressed",
        choices=["uncompressed", "none", "zstd", "lz4"],
        help="Record batch compression for Feather v2. Use uncompressed/none for browser Arrow JS."
    )
    return p


def ensure_outdir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def select_cast_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = {}
    # Required / common
    if "Cell_Num" in df.columns:
        cols["cell_id"] = pd.to_numeric(df["Cell_Num"], errors="coerce").fillna(-1).astype("int32")
    if "X" in df.columns: cols["X"] = pd.to_numeric(df["X"], errors="coerce").astype("float32")
    if "Y" in df.columns: cols["Y"] = pd.to_numeric(df["Y"], errors="coerce").astype("float32")
    if "Z" in df.columns: cols["Z"] = pd.to_numeric(df["Z"], errors="coerce").astype("float32")
    if "ClassName" in df.columns: cols["ClassName"] = df["ClassName"].astype("string")
    if "Prob" in df.columns:
        # Could be scalar or array; keep as string if parsing fails
        prob = pd.to_numeric(df["Prob"], errors="coerce")
        if prob.notna().any():
            cols["Prob"] = prob.fillna(0).astype("float32")
        else:
            cols["Prob"] = df["Prob"].astype("string")
    if "gaussian_contour" in df.columns:
        cols["gaussian_contour"] = df["gaussian_contour"].astype("string")
    # Optional passthroughs (keep as string)
    for optional in ("sphere_scale", "sphere_rotation"):
        if optional in df.columns:
            cols[optional] = df[optional].astype("string")
    return pd.DataFrame(cols)


def main():
    args = build_argparser().parse_args()
    inp = Path(args.input)
    outdir = Path(args.outdir)
    ensure_outdir(outdir)

    comp = args.compression
    if comp == "none":
        comp = None

    # Class dictionary
    class_to_id = {}
    next_class_id = 0

    shards = []
    total_rows = 0
    shard_index = 0

    reader = pd.read_csv(inp, sep="\t", dtype="string", chunksize=args.rows_per_shard)

    for chunk in reader:
        df = select_cast_columns(chunk)
        # ClassName -> class_id
        if "ClassName" in df.columns:
            for cname in df["ClassName"].dropna().unique():
                if cname not in class_to_id:
                    class_to_id[cname] = next_class_id
                    next_class_id += 1
            df["class_id"] = df["ClassName"].map(class_to_id).astype("uint16")

        arrays = {}
        for col in df.columns:
            s = df[col]
            if pd.api.types.is_string_dtype(s):
                arrays[col] = pa.array(s.astype("string"))
            elif pd.api.types.is_float_dtype(s):
                arrays[col] = pa.array(s.astype("float32"))
            elif pd.api.types.is_integer_dtype(s):
                # choose smallest reasonable integer type
                if str(s.dtype).startswith("uint16"):
                    arrays[col] = pa.array(s.astype("uint16"))
                elif str(s.dtype).startswith("int32"):
                    arrays[col] = pa.array(s.astype("int32"))
                else:
                    arrays[col] = pa.array(s.astype("int64"))
            else:
                arrays[col] = pa.array(s)

        table = pa.table(arrays)
        shard_name = f"cells_shard_{shard_index:03d}.feather"
        feather.write_feather(table, (outdir / shard_name).as_posix(), compression=comp)
        n = len(df)
        shards.append({"url": shard_name, "rows": int(n)})
        total_rows += n
        shard_index += 1
        print(f"Wrote {shard_name} with {n} rows")

    # Manifest and class dict
    manifest = {"format": "arrow-feather", "total_rows": int(total_rows), "shards": shards}
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    if class_to_id:
        id_to_class = {int(v): k for k, v in class_to_id.items()}
        (outdir / "class_dict.json").write_text(json.dumps(id_to_class, indent=2))

    print(f"Done. Total rows: {total_rows}. Shards: {len(shards)}. Output dir: {outdir}")


if __name__ == "__main__":
    main()

